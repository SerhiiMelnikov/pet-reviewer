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

describe("ClaudeProvider.chat caching", () => {
  const tools: IToolSpec[] = [
    { name: "read_file", description: "d", inputSchema: { type: "object" } },
  ];

  it("marks the first user message with cache_control on the first turn", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "hi" }] });
    const client = { messages: { create } };
    const provider = new ClaudeProvider("k", undefined, client as any);

    await provider.chat([{ role: "user", content: "REVIEW PROMPT" }], tools);

    const body = create.mock.calls[0][0];
    expect(Array.isArray(body.messages[0].content)).toBe(true);
    expect(body.messages[0].content[0]).toEqual({
      type: "text",
      text: "REVIEW PROMPT",
      cache_control: { type: "ephemeral" },
    });
  });

  it("caches the static first block and the rolling last block across turns", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "done" }] });
    const client = { messages: { create } };
    const provider = new ClaudeProvider("k", undefined, client as any);

    const messages: IMessage[] = [
      { role: "user", content: "REVIEW PROMPT" },
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "read_file", input: { path: "a.ts" } }] },
      { role: "user", content: [{ type: "tool_result", toolCallId: "t1", content: "file body" }] },
    ];
    await provider.chat(messages, tools);

    const body = create.mock.calls[0][0];
    const firstBlocks = body.messages[0].content;
    expect(firstBlocks[firstBlocks.length - 1].cache_control).toEqual({ type: "ephemeral" });
    const lastBlocks = body.messages[2].content;
    expect(lastBlocks[lastBlocks.length - 1].cache_control).toEqual({ type: "ephemeral" });
    expect(body.messages[1].content[0].cache_control).toBeUndefined();
  });

  it("does not add cache_control to single-shot review requests", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "[]" }] });
    const client = { messages: { create } };
    const provider = new ClaudeProvider("k", undefined, client as any);

    await provider.review("PROMPT");

    const body = create.mock.calls[0][0];
    expect(body.messages[0].content).toBe("PROMPT");
  });
});
