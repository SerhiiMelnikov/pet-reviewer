import {
  IReviewProvider,
  IAgentProvider,
  IAgentTurn,
  IMessage,
  IToolSpec,
  IChatOptions,
} from "./types";
import { ERRORS } from "../errors";

interface IOllamaResponse {
  response: string;
}

interface IOllamaToolCall {
  function: { name: string; arguments: unknown };
}

interface IOllamaChatResponse {
  message?: { content?: string; tool_calls?: IOllamaToolCall[] };
}

function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function normalizeArgs(args: unknown): Record<string, unknown> {
  if (typeof args === "string") return safeParseArgs(args);
  // Only a plain object is a valid args map; arrays/primitives/null → empty.
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  return {};
}

// We mint tool-call ids as "name__i" (Ollama returns none); decode the name back for the
// tool_name field Ollama uses to match a result to its call.
function decodeName(toolCallId: string): string {
  return toolCallId.replace(/__\d+$/, "");
}

// One internal IMessage can expand into several Ollama messages: a user message carrying an
// array of tool_result blocks becomes N separate role:"tool" messages (Ollama matches each
// result to its call by order; tool_name helps newer versions).
function toOllamaMessages(messages: IMessage[]): unknown[] {
  const out: unknown[] = [];
  for (const message of messages) {
    if (typeof message.content === "string") {
      out.push({ role: message.role, content: message.content });
      continue;
    }
    if (message.role === "assistant") {
      let text = "";
      const toolCalls: { function: { name: string; arguments: Record<string, unknown> } }[] = [];
      for (const block of message.content) {
        if (block.type === "text") {
          text += block.text;
        } else if (block.type === "tool_use") {
          // Ollama wants arguments as an object, not a JSON string.
          toolCalls.push({ function: { name: block.name, arguments: block.input } });
        }
      }
      const assistant: Record<string, unknown> = { role: "assistant", content: text };
      if (toolCalls.length) assistant.tool_calls = toolCalls;
      out.push(assistant);
      continue;
    }
    // role:"user" with content blocks → one role:"tool" message per tool_result.
    for (const block of message.content) {
      if (block.type === "tool_result") {
        const content = block.isError ? `[ERROR] ${block.content}` : block.content;
        out.push({ role: "tool", content, tool_name: decodeName(block.toolCallId) });
      } else if (block.type === "text") {
        out.push({ role: "user", content: block.text });
      }
    }
  }
  return out;
}

export class OllamaProvider implements IReviewProvider, IAgentProvider {
  constructor(
    readonly model = "llama3.2",
    readonly baseUrl = "http://localhost:11434",
    readonly temperature = 0,
    private fetchFn: typeof fetch = fetch,
    readonly timeoutMs = 180_000,
  ) {}

  // Shared transport: POST a body to an Ollama endpoint, map errors with Ollama-specific
  // hints, return the parsed JSON. Used by both review() (/api/generate) and chat() (/api/chat).
  private async request(path: string, body: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        throw ERRORS.providerTimeout(
          "Ollama",
          this.timeoutMs / 1000,
          `Warm it up with \`ollama run ${this.model}\` or increase the timeout.`,
        );
      }
      throw ERRORS.providerUnreachable(
        "Ollama",
        this.baseUrl,
        "Is the server running (`ollama serve`)?",
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw ERRORS.providerHttp(
        "Ollama",
        res.status,
        `Is the model \`${this.model}\` pulled (\`ollama pull ${this.model}\`)?`,
      );
    }

    return res.json();
  }

  async review(prompt: string): Promise<string> {
    const data = (await this.request("/api/generate", {
      model: this.model,
      prompt,
      stream: false,
      format: "json",
      options: { temperature: this.temperature },
    })) as IOllamaResponse;
    return data.response;
  }

  // Ollama's /api/chat has no tool_choice, so IChatOptions.forceTool (passed by the agent
  // loop on forced finalization) is ignored here. That turn already restricts the tools to
  // submit_review only, which steers the model there; the empty-truncated fallback in
  // agent.ts covers the case where it still returns nothing usable.
  async chat(messages: IMessage[], tools: IToolSpec[], _opts?: IChatOptions): Promise<IAgentTurn> {
    const data = (await this.request("/api/chat", {
      model: this.model,
      messages: toOllamaMessages(messages),
      tools: tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      })),
      stream: false,
      options: { temperature: this.temperature },
    })) as IOllamaChatResponse;

    const message = data.message;
    const text = message?.content || undefined;
    const toolCalls = (message?.tool_calls ?? []).map((tc, i) => ({
      id: `${tc.function.name}__${i}`,
      name: tc.function.name,
      input: normalizeArgs(tc.function.arguments),
    }));

    if (text === undefined && toolCalls.length === 0) {
      throw ERRORS.providerEmptyResponse("Ollama");
    }
    return { text, toolCalls };
  }
}
