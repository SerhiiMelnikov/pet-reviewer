import {
  IReviewProvider,
  IAgentProvider,
  IAgentTurn,
  IMessage,
  IToolSpec,
  IChatOptions,
} from "./types";
import { ERRORS } from "../errors";

interface IOpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface IOpenAIResponse {
  choices?: Array<{
    message?: { content?: string | null; tool_calls?: IOpenAIToolCall[] };
  }>;
}

function safeParseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    // Non-object JSON (array, primitive) is not a valid args map — treat as empty.
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// One internal IMessage can expand into several OpenAI messages: a user message
// carrying an array of tool_result blocks becomes N separate role:"tool" messages,
// because OpenAI matches each result to its own tool_call_id (it has no bundled form).
function toOpenAIMessages(messages: IMessage[]): unknown[] {
  const out: unknown[] = [];
  for (const message of messages) {
    if (typeof message.content === "string") {
      out.push({ role: message.role, content: message.content });
      continue;
    }
    if (message.role === "assistant") {
      let text = "";
      const toolCalls: IOpenAIToolCall[] = [];
      for (const block of message.content) {
        if (block.type === "text") {
          text += block.text;
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            type: "function",
            function: { name: block.name, arguments: JSON.stringify(block.input) },
          });
        }
      }
      // OpenAI requires content:null (not "") on an assistant message with tool_calls.
      const assistant: Record<string, unknown> = { role: "assistant", content: text || null };
      if (toolCalls.length) assistant.tool_calls = toolCalls;
      out.push(assistant);
      continue;
    }
    // role:"user" with content blocks → one role:"tool" message per tool_result.
    for (const block of message.content) {
      if (block.type === "tool_result") {
        // OpenAI has no is_error field on tool messages, so flag failures inline
        // (same idea as Gemini's { error } wrapper) — otherwise the model can't tell
        // a failed tool call from a successful one.
        const content = block.isError ? `[ERROR] ${block.content}` : block.content;
        out.push({ role: "tool", tool_call_id: block.toolCallId, content });
      } else if (block.type === "text") {
        // Defensive fallback: the agent loop never sends user text blocks.
        out.push({ role: "user", content: block.text });
      }
    }
  }
  return out;
}

export class OpenAICompatibleProvider implements IReviewProvider, IAgentProvider {
  constructor(
    private apiKey: string,
    readonly model = "gpt-4o-mini",
    readonly baseUrl = "https://api.openai.com/v1",
    readonly temperature = 0,
    private fetchFn: typeof fetch = fetch,
    readonly timeoutMs = 180_000,
  ) {}

  // Shared transport: POST a request body to /chat/completions, map errors,
  // return the parsed response. Used by both review() and chat().
  private async request(body: unknown): Promise<IOpenAIResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        throw ERRORS.providerTimeout("OpenAI", this.timeoutMs / 1000);
      }
      throw ERRORS.providerUnreachable(
        "OpenAI",
        this.baseUrl,
        "Check your internet connection.",
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw ERRORS.providerHttp(
        "OpenAI",
        res.status,
        `Check your OPENAI_API_KEY, the baseUrl, and that the model \`${this.model}\` exists.`,
      );
    }

    return (await res.json()) as IOpenAIResponse;
  }

  async review(prompt: string): Promise<string> {
    const data = await this.request({
      model: this.model,
      temperature: this.temperature,
      messages: [{ role: "user", content: prompt }],
    });
    const content = data.choices?.[0]?.message?.content;
    if (content === undefined || content === null) {
      throw ERRORS.providerEmptyResponse("OpenAI");
    }
    return content;
  }

  async chat(messages: IMessage[], tools: IToolSpec[], opts: IChatOptions = {}): Promise<IAgentTurn> {
    const body: Record<string, unknown> = {
      model: this.model,
      temperature: this.temperature,
      messages: toOpenAIMessages(messages),
      tools: tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      })),
    };
    if (opts.forceTool) {
      body.tool_choice = { type: "function", function: { name: opts.forceTool } };
    }

    const data = await this.request(body);
    const message = data.choices?.[0]?.message;
    const text = message?.content || undefined;
    const toolCalls = (message?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      input: safeParseArgs(tc.function.arguments),
    }));

    if (text === undefined && toolCalls.length === 0) {
      throw ERRORS.providerEmptyResponse("OpenAI");
    }
    return { text, toolCalls };
  }
}
