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
    const provider = new ClaudeProvider("key", "claude-haiku-4-5-20251001", 0, fakeClient);

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
    const provider = new ClaudeProvider("k", undefined, 0, client as any);
    const tools: IToolSpec[] = [{ name: "read_file", description: "d", inputSchema: { type: "object" } }];
    const messages: IMessage[] = [{ role: "user", content: "review this" }];

    const turn = await provider.chat(messages, tools);

    expect(turn.text).toBe("let me look");
    expect(turn.toolCalls).toEqual([{ id: "t1", name: "read_file", input: { path: "a.ts" } }]);
    expect(calls[0].tools[0].name).toBe("read_file");
    expect(calls[0].tools[0].input_schema).toEqual({ type: "object" });
  });
});

describe("ClaudeProvider.chat forceTool", () => {
  it("forces the tool via tool_choice when forceTool is set", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "x" }] });
    const client = { messages: { create } };
    const provider = new ClaudeProvider("k", undefined, 0, client as any);
    const submitTool: IToolSpec[] = [
      { name: "submit_review", description: "s", inputSchema: { type: "object" } },
    ];

    await provider.chat([{ role: "user", content: "hi" }], submitTool, { forceTool: "submit_review" });

    const body = create.mock.calls[0][0];
    expect(body.tool_choice).toEqual({ type: "tool", name: "submit_review" });
  });

  it("does not set tool_choice when no forceTool is given", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "x" }] });
    const client = { messages: { create } };
    const provider = new ClaudeProvider("k", undefined, 0, client as any);
    const tools: IToolSpec[] = [{ name: "read_file", description: "d", inputSchema: { type: "object" } }];

    await provider.chat([{ role: "user", content: "hi" }], tools);

    const body = create.mock.calls[0][0];
    expect(body.tool_choice).toBeUndefined();
  });
});

describe("ClaudeProvider.chat caching", () => {
  const tools: IToolSpec[] = [
    { name: "read_file", description: "d", inputSchema: { type: "object" } },
  ];

  it("marks the first user message with cache_control on the first turn", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "hi" }] });
    const client = { messages: { create } };
    const provider = new ClaudeProvider("k", undefined, 0, client as any);

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
    const provider = new ClaudeProvider("k", undefined, 0, client as any);

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
    const provider = new ClaudeProvider("k", undefined, 0, client as any);

    await provider.review("PROMPT");

    const body = create.mock.calls[0][0];
    expect(body.messages[0].content).toBe("PROMPT");
  });
});

describe("ClaudeProvider temperature", () => {
  it("defaults temperature to 0 in review and chat", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "x" }] });
    const client = { messages: { create } };
    const provider = new ClaudeProvider("k", undefined, 0, client as any);

    await provider.review("p");
    expect(create.mock.calls[0][0].temperature).toBe(0);

    await provider.chat([{ role: "user", content: "hi" }], []);
    expect(create.mock.calls[1][0].temperature).toBe(0);
  });

  it("passes a custom temperature through", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "x" }] });
    const client = { messages: { create } };
    const provider = new ClaudeProvider("k", undefined, 0.7, client as any);

    await provider.review("p");
    expect(create.mock.calls[0][0].temperature).toBe(0.7);
  });
});

describe("ClaudeProvider temperature retry", () => {
  it("retries review without temperature on a 400 about temperature", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("temperature is deprecated for this model"), { status: 400 }),
      )
      .mockResolvedValueOnce({ content: [{ type: "text", text: "[]" }] });
    const provider = new ClaudeProvider("key", "claude-opus-4-8", 0, { messages: { create } } as any);

    const result = await provider.review("P");

    expect(result).toBe("[]");
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0]).toHaveProperty("temperature");
    expect(create.mock.calls[1][0]).not.toHaveProperty("temperature");
  });

  it("retries chat without temperature on a 400 about temperature", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("`temperature` is deprecated for this model."), { status: 400 }),
      )
      .mockResolvedValueOnce({ content: [{ type: "text", text: "done" }] });
    const provider = new ClaudeProvider("key", "claude-opus-4-8", 0, { messages: { create } } as any);

    const turn = await provider.chat([{ role: "user", content: "hi" }], []);

    expect(turn.text).toBe("done");
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0]).not.toHaveProperty("temperature");
  });

  it("rethrows a 400 that is not about temperature", async () => {
    const create = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("messages: field required"), { status: 400 }));
    const provider = new ClaudeProvider("key", "claude-opus-4-8", 0, { messages: { create } } as any);

    await expect(provider.review("P")).rejects.toThrow(/field required/);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
