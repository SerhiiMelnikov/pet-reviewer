import Anthropic from "@anthropic-ai/sdk";
import { IReviewProvider, IAgentProvider, IAgentTurn, IMessage, IToolSpec, TContentBlock, IChatOptions, IUsage } from "./types";

// Minimal client contract we need (makes testing easy).
interface IMessagesClient {
  messages: {
    create(body: unknown): Promise<{
      content: Array<{
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: Record<string, unknown>;
      }>;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
      };
    }>;
  };
}

function toAnthropicBlock(b: TContentBlock): unknown {
  if (b.type === "text") return { type: "text", text: b.text };
  if (b.type === "tool_use") return { type: "tool_use", id: b.id, name: b.name, input: b.input };
  return { type: "tool_result", tool_use_id: b.toolCallId, content: b.content, is_error: b.isError };
}

function toAnthropicMessage(m: IMessage): unknown {
  return {
    role: m.role,
    content: typeof m.content === "string" ? m.content : m.content.map(toAnthropicBlock),
  };
}

const EPHEMERAL = { type: "ephemeral" } as const;

// Mark a message's last content block with cache_control, converting a plain
// string content into a single text block first.
function markLastBlock(message: { role: string; content: unknown }): void {
  if (typeof message.content === "string") {
    message.content = [{ type: "text", text: message.content, cache_control: EPHEMERAL }];
    return;
  }
  if (Array.isArray(message.content) && message.content.length > 0) {
    const last = message.content[message.content.length - 1] as Record<string, unknown>;
    last.cache_control = EPHEMERAL;
  }
}

// Static breakpoint on the first message (instructions + diff — also caches tools),
// rolling breakpoint on the last message each turn. If there is only one message,
// both land on it (idempotent).
function addCacheBreakpoints(messages: Array<{ role: string; content: unknown }>): void {
  if (messages.length === 0) return;
  markLastBlock(messages[0]);
  markLastBlock(messages[messages.length - 1]);
}

export class ClaudeProvider implements IReviewProvider, IAgentProvider {
  private client: IMessagesClient;

  constructor(
    apiKey: string,
    readonly model = "claude-haiku-4-5-20251001",
    readonly temperature = 0,
    client?: IMessagesClient,
    readonly timeoutMs = 180_000,
  ) {
    this.client = client ?? (new Anthropic({ apiKey, timeout: timeoutMs }) as unknown as IMessagesClient);
  }

  // Anthropic deprecates `temperature` on some models (opus-4-7/4-8): they 400 with a
  // message mentioning temperature. Try with it; on that specific 400, retry without it.
  private async createWithTempRetry(body: Record<string, unknown>) {
    try {
      return await this.client.messages.create(body);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const message = (err as { message?: string })?.message ?? "";
      if (status === 400 && /temperature/i.test(message)) {
        const { temperature, ...rest } = body;
        void temperature;
        return await this.client.messages.create(rest);
      }
      throw err;
    }
  }

  private toUsage(raw?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
  }): IUsage {
    return {
      inputTokens: raw?.input_tokens ?? 0,
      outputTokens: raw?.output_tokens ?? 0,
      cacheReadTokens: raw?.cache_read_input_tokens ?? 0,
    };
  }

  async review(prompt: string): Promise<{ text: string; usage?: IUsage }> {
    const msg = await this.createWithTempRetry({
      model: this.model,
      max_tokens: 2048,
      temperature: this.temperature,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    return { text, usage: this.toUsage(msg.usage) };
  }

  async chat(messages: IMessage[], tools: IToolSpec[], opts: IChatOptions = {}): Promise<IAgentTurn> {
    const anthropicMessages = messages.map(toAnthropicMessage) as Array<{
      role: string;
      content: unknown;
    }>;
    addCacheBreakpoints(anthropicMessages);

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: 4096,
      temperature: this.temperature,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      })),
      messages: anthropicMessages,
    };
    if (opts.forceTool) {
      body.tool_choice = { type: "tool", name: opts.forceTool };
    }

    const res = await this.createWithTempRetry(body);
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    const toolCalls = res.content
      .filter((b) => b.type === "tool_use")
      .map((b) => ({ id: b.id as string, name: b.name as string, input: b.input ?? {} }));
    return { text: text || undefined, toolCalls };
  }
}
