import { describe, it, expect, vi } from "vitest";
import { ClaudeProvider } from "../src/providers/claude";
import { IMessage, IToolSpec } from "../src/providers/types";

describe("ClaudeProvider", () => {
  it("sends the prompt and joins text from response blocks", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        { type: "text", text: "[" },
        { type: "text", text: "]" },
      ],
    });
    const fakeClient = { messages: { create } };
    const provider = new ClaudeProvider("key", "claude-haiku-4-5-20251001", fakeClient);

    const result = await provider.review("MY_PROMPT");

    expect(result).toBe("[]");
    const body = create.mock.calls[0][0];
    expect(body.model).toBe("claude-haiku-4-5-20251001");
    expect(body.messages[0].content).toBe("MY_PROMPT");
  });
});

describe("ClaudeProvider.chat", () => {
  it("passes tools and maps tool_use blocks into tool calls", async () => {
    const calls: any[] = [];
    const client = {
      messages: {
        create: async (body: any) => {
          calls.push(body);
          return {
            content: [
              { type: "text", text: "let me look" },
              { type: "tool_use", id: "t1", name: "read_file", input: { path: "a.ts" } },
            ],
          };
        },
      },
    };
    const provider = new ClaudeProvider("k", undefined, client as any);
    const tools: IToolSpec[] = [{ name: "read_file", description: "d", inputSchema: { type: "object" } }];
    const messages: IMessage[] = [{ role: "user", content: "review this" }];

    const turn = await provider.chat(messages, tools);

    expect(turn.text).toBe("let me look");
    expect(turn.toolCalls).toEqual([{ id: "t1", name: "read_file", input: { path: "a.ts" } }]);
    expect(calls[0].tools[0].name).toBe("read_file");
    expect(calls[0].tools[0].input_schema).toEqual({ type: "object" });
  });
});
