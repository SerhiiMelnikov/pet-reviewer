import { describe, it, expect, vi } from "vitest";
import { OllamaProvider } from "../src/providers/ollama";
import { IMessage, IToolSpec } from "../src/providers/types";

function fakeFetch(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

const TOOLS: IToolSpec[] = [
  { name: "read_file", description: "read a file", inputSchema: { type: "object" } },
];

describe("OllamaProvider", () => {
  it("sends the prompt and returns the response field", async () => {
    const fetchFn = fakeFetch({ response: "[1,2]" });
    const provider = new OllamaProvider("llama3.2", "http://localhost:11434", 0, fetchFn);
    const result = await provider.review("MY_PROMPT");

    expect(result).toBe("[1,2]");
    const [url, init] = (fetchFn as any).mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/generate");
    expect(JSON.parse(init.body).prompt).toBe("MY_PROMPT");
    expect(JSON.parse(init.body).stream).toBe(false);
  });

  it("throws a clear error on a non-ok response", async () => {
    const fetchFn = fakeFetch({}, false, 500);
    const provider = new OllamaProvider("llama3.2", "http://localhost:11434", 0, fetchFn);
    await expect(provider.review("x")).rejects.toThrow(/500/);
  });

  it("throws a friendly error when the connection fails", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("fetch failed")) as unknown as typeof fetch;
    const provider = new OllamaProvider("llama3.2", "http://localhost:11434", 0, fetchFn);
    await expect(provider.review("x")).rejects.toThrow(/ollama serve/);
  });

  it("throws a timeout error when the request is aborted", async () => {
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    const fetchFn = vi.fn().mockRejectedValue(abortErr) as unknown as typeof fetch;
    const provider = new OllamaProvider("llama3.2", "http://localhost:11434", 0, fetchFn);
    await expect(provider.review("x")).rejects.toThrow(/timed out/);
  });

  it("sends temperature in options", async () => {
    const fetchFn = fakeFetch({ response: "[]" });
    const provider = new OllamaProvider("llama3.2", "http://localhost:11434", 0, fetchFn);
    await provider.review("p");
    expect(JSON.parse((fetchFn as any).mock.calls[0][1].body).options.temperature).toBe(0);
  });
});

describe("OllamaProvider.chat", () => {
  function chatProvider(fetchFn: typeof fetch) {
    return new OllamaProvider("llama3.2", "http://localhost:11434", 0, fetchFn);
  }

  it("posts to /api/chat with stream:false and maps tool specs", async () => {
    const fetchFn = fakeFetch({ message: { content: "ok" } });
    await chatProvider(fetchFn).chat([{ role: "user", content: "hi" }], TOOLS);
    const [url, init] = (fetchFn as any).mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/chat");
    const body = JSON.parse(init.body);
    expect(body.stream).toBe(false);
    expect(body.tools[0]).toEqual({
      type: "function",
      function: { name: "read_file", description: "read a file", parameters: { type: "object" } },
    });
    expect(body.messages[0]).toEqual({ role: "user", content: "hi" });
  });

  it("parses tool_calls into IToolCall[] with a minted id and object input", async () => {
    const fetchFn = fakeFetch({
      message: { content: "", tool_calls: [{ function: { name: "read_file", arguments: { path: "x.ts" } } }] },
    });
    const turn = await chatProvider(fetchFn).chat([{ role: "user", content: "hi" }], TOOLS);
    expect(turn.text).toBeUndefined();
    expect(turn.toolCalls).toEqual([{ id: "read_file__0", name: "read_file", input: { path: "x.ts" } }]);
  });

  it("parses string-form tool-call arguments and falls back to {} on malformed", async () => {
    const ok = fakeFetch({
      message: { tool_calls: [{ function: { name: "grep", arguments: '{"pattern":"foo"}' } }] },
    });
    const turn1 = await chatProvider(ok).chat([{ role: "user", content: "hi" }], TOOLS);
    expect(turn1.toolCalls[0].input).toEqual({ pattern: "foo" });

    const bad = fakeFetch({
      message: { tool_calls: [{ function: { name: "grep", arguments: "{not json" } }] },
    });
    const turn2 = await chatProvider(bad).chat([{ role: "user", content: "hi" }], TOOLS);
    expect(turn2.toolCalls[0].input).toEqual({});
  });

  it("falls back to {} when tool-call arguments are not a plain object", async () => {
    const fetchFn = fakeFetch({
      message: { tool_calls: [{ function: { name: "grep", arguments: [1, 2] } }] },
    });
    const turn = await chatProvider(fetchFn).chat([{ role: "user", content: "hi" }], TOOLS);
    expect(turn.toolCalls[0].input).toEqual({});
  });

  it("serializes an assistant tool_use turn with object arguments and no id", async () => {
    const fetchFn = fakeFetch({ message: { content: "ok" } });
    const messages: IMessage[] = [
      { role: "user", content: "review" },
      { role: "assistant", content: [
        { type: "text", text: "let me look" },
        { type: "tool_use", id: "read_file__0", name: "read_file", input: { path: "x.ts" } },
      ] },
      { role: "user", content: [{ type: "tool_result", toolCallId: "read_file__0", content: "file body" }] },
    ];
    await chatProvider(fetchFn).chat(messages, TOOLS);
    const sent = JSON.parse((fetchFn as any).mock.calls[0][1].body).messages;
    expect(sent[1]).toEqual({
      role: "assistant",
      content: "let me look",
      tool_calls: [{ function: { name: "read_file", arguments: { path: "x.ts" } } }],
    });
    expect(sent[2]).toEqual({ role: "tool", content: "file body", tool_name: "read_file" });
  });

  it("expands multiple tool_result blocks and marks errors with [ERROR]", async () => {
    const fetchFn = fakeFetch({ message: { content: "ok" } });
    const messages: IMessage[] = [
      { role: "user", content: [
        { type: "tool_result", toolCallId: "read_file__0", content: "A" },
        { type: "tool_result", toolCallId: "grep__1", content: "boom", isError: true },
      ] },
    ];
    await chatProvider(fetchFn).chat(messages, TOOLS);
    const sent = JSON.parse((fetchFn as any).mock.calls[0][1].body).messages;
    expect(sent).toEqual([
      { role: "tool", content: "A", tool_name: "read_file" },
      { role: "tool", content: "[ERROR] boom", tool_name: "grep" },
    ]);
  });

  it("throws an empty-response error when there is neither text nor tool calls", async () => {
    const fetchFn = fakeFetch({ message: { content: "" } });
    await expect(chatProvider(fetchFn).chat([{ role: "user", content: "hi" }], TOOLS)).rejects.toThrow(/no content/i);
  });

  it("sends temperature in the chat body", async () => {
    const fetchFn = fakeFetch({ message: { content: "ok" } });
    const provider = new OllamaProvider("llama3.2", "http://localhost:11434", 0.5, fetchFn);
    await provider.chat([{ role: "user", content: "hi" }], TOOLS);
    expect(JSON.parse((fetchFn as any).mock.calls[0][1].body).options.temperature).toBe(0.5);
  });
});
