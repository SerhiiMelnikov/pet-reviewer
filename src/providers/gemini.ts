import {
  IReviewProvider,
  IAgentProvider,
  IAgentTurn,
  IMessage,
  IToolSpec,
  TContentBlock,
} from "./types";
import { ERRORS } from "../errors";

interface IGeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
}

interface IGeminiResponse {
  candidates?: Array<{ content?: { parts?: IGeminiPart[] } }>;
}

// Gemini matches tool results by function NAME and returns no ids. We mint ids that
// encode the name ("read_file__0") and decode the name back when sending results.
function decodeName(toolCallId: string): string {
  return toolCallId.replace(/__\d+$/, "");
}

function toGeminiPart(block: TContentBlock): unknown {
  if (block.type === "text") return { text: block.text };
  if (block.type === "tool_use") {
    return { functionCall: { name: block.name, args: block.input } };
  }
  return {
    functionResponse: {
      name: decodeName(block.toolCallId),
      response: block.isError ? { error: block.content } : { content: block.content },
    },
  };
}

// Gemini's function parameters use an OpenAPI subset: `type` must be a single
// string, and nullability is a separate `nullable` flag — not a ["x","null"] union
// (which JSON Schema / Anthropic allow). Rewrite union-with-null into that form.
function toGeminiSchema(schema: unknown): unknown {
  if (typeof schema !== "object" || schema === null) return schema;
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === "type" && Array.isArray(value)) {
      out.type = value.find((t) => t !== "null");
      if (value.includes("null")) out.nullable = true;
    } else if (key === "properties" && value && typeof value === "object") {
      const props: Record<string, unknown> = {};
      for (const [propName, propSchema] of Object.entries(value as Record<string, unknown>)) {
        props[propName] = toGeminiSchema(propSchema);
      }
      out.properties = props;
    } else if (key === "items") {
      out.items = toGeminiSchema(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function toGeminiContent(message: IMessage): unknown {
  const role = message.role === "assistant" ? "model" : "user";
  const parts =
    typeof message.content === "string"
      ? [{ text: message.content }]
      : message.content.map(toGeminiPart);
  return { role, parts };
}

export class GeminiProvider implements IReviewProvider, IAgentProvider {
  constructor(
    private apiKey: string,
    readonly model = "gemini-2.5-flash",
    readonly baseUrl = "https://generativelanguage.googleapis.com",
    private fetchFn: typeof fetch = fetch,
    private timeoutMs = 180_000,
  ) {}

  // Shared transport: POST a request body, map errors, return the parsed response.
  private async generate(body: unknown): Promise<IGeminiResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchFn(
        `${this.baseUrl}/v1beta/models/${this.model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.apiKey,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        throw ERRORS.providerTimeout("Gemini", this.timeoutMs / 1000);
      }
      throw ERRORS.providerUnreachable(
        "Gemini",
        this.baseUrl,
        "Check your internet connection.",
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw ERRORS.providerHttp(
        "Gemini",
        res.status,
        `Check your GEMINI_API_KEY and that the model \`${this.model}\` exists.`,
      );
    }

    return (await res.json()) as IGeminiResponse;
  }

  async review(prompt: string): Promise<string> {
    const data = await this.generate({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text === undefined) {
      throw ERRORS.providerEmptyResponse("Gemini");
    }
    return text;
  }

  async chat(messages: IMessage[], tools: IToolSpec[]): Promise<IAgentTurn> {
    const data = await this.generate({
      contents: messages.map(toGeminiContent),
      tools: [
        {
          functionDeclarations: tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: toGeminiSchema(t.inputSchema),
          })),
        },
      ],
    });

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .filter((p) => typeof p.text === "string")
      .map((p) => p.text ?? "")
      .join("");
    const toolCalls = parts
      .filter((p) => p.functionCall)
      .map((p, i) => ({
        id: `${p.functionCall!.name}__${i}`,
        name: p.functionCall!.name,
        input: p.functionCall!.args ?? {},
      }));

    return { text: text || undefined, toolCalls };
  }
}
