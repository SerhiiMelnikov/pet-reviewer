// Common contract for any LLM review engine.
export interface IReviewProvider {
  // Takes a ready prompt; returns the RAW model text plus token usage for the call.
  review(prompt: string): Promise<{ text: string; usage?: IUsage }>;
}

// --- Agent mode (tool use) ---

export interface IToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// Token accounting for one model call. Missing fields default to 0 per provider.
export interface IUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number; // Claude prompt caching; 0/omitted elsewhere
}

export interface IToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  // Opaque, provider-specific token round-tripped verbatim (Gemini 3.x thoughtSignature).
  signature?: string;
}

// Provider-agnostic conversation blocks (model the tool-use exchange).
export type TContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown>; signature?: string }
  | { type: "tool_result"; toolCallId: string; content: string; isError?: boolean };

export interface IMessage {
  role: "user" | "assistant";
  content: string | TContentBlock[];
}

export interface IAgentTurn {
  text?: string;
  toolCalls: IToolCall[];
}

export interface IChatOptions {
  // When set, the provider must force the model to call this tool this turn.
  forceTool?: string;
}

// A provider that can drive a tool-use loop.
export interface IAgentProvider {
  chat(messages: IMessage[], tools: IToolSpec[], opts?: IChatOptions): Promise<IAgentTurn>;
}
