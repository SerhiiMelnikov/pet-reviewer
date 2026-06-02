// Common contract for any LLM review engine.
export interface IReviewProvider {
  // Takes a ready prompt, returns the RAW text of the model's response.
  review(prompt: string): Promise<string>;
}

// --- Agent mode (tool use) ---

export interface IToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface IToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// Provider-agnostic conversation blocks (model the tool-use exchange).
export type TContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolCallId: string; content: string; isError?: boolean };

export interface IMessage {
  role: "user" | "assistant";
  content: string | TContentBlock[];
}

export interface IAgentTurn {
  text?: string;
  toolCalls: IToolCall[];
}

// A provider that can drive a tool-use loop.
export interface IAgentProvider {
  chat(messages: IMessage[], tools: IToolSpec[]): Promise<IAgentTurn>;
}
