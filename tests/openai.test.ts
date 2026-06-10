import { describe, it, expect, vi } from "vitest";
import { OpenAICompatibleProvider } from "../src/providers/openai";
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

describe("OpenAICompatibleProvider", () => {
  it("sends the prompt to /chat/completions and returns the content", async () => {
    const fetchFn = fakeFetch({
      choices: [{ message: { content: "[1,2]" } }],
    });
    const provider = new OpenAICompatibleProvider(
      "KEY",
      "gpt-4o-mini",
      "https://api.openai.com/v1",
      0,
      fetchFn,
    );
    const { text } = await provider.review("MY_PROMPT");

    expect(text).toBe("[1,2]");
    const [url, init] = (fetchFn as any).mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.headers["Authorization"]).toBe("Bearer KEY");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages[0].content).toBe("MY_PROMPT");
    expect(body.response_format).toBeUndefined();
  });

  it("returns mapped usage from prompt_tokens and completion_tokens", async () => {
    const fetchFn = fakeFetch({
      choices: [{ message: { content: "[]" } }],
      usage: { prompt_tokens: 70, completion_tokens: 15 },
    });
    const provider = new OpenAICompatibleProvider("KEY", undefined, undefined, 0, fetchFn);

    const result = await provider.review("p");

    expect(result.usage).toEqual({ inputTokens: 70, outputTokens: 15 });
  });

  it("throws a clear error on a non-ok response", async () => {
    const fetchFn = fakeFetch({}, false, 401);
    const provider = new OpenAICompatibleProvider("KEY", undefined, undefined, 0, fetchFn);
    await expect(provider.review("x")).rejects.toThrow(/401/);
  });

  it("throws a friendly error when the connection fails", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValue(new Error("fetch failed")) as unknown as typeof fetch;
    const provider = new OpenAICompatibleProvider("KEY", undefined, undefined, 0, fetchFn);
    await expect(provider.review("x")).rejects.toThrow(/reach OpenAI/);
  });

  it("throws a timeout error when the request is aborted", async () => {
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    const fetchFn = vi
      .fn()
      .mockRejectedValue(abortErr) as unknown as typeof fetch;
    const provider = new OpenAICompatibleProvider("KEY", undefined, undefined, 0, fetchFn);
    await expect(provider.review("x")).rejects.toThrow(/timed out/);
  });

  it("throws when the response has no choices", async () => {
    const fetchFn = fakeFetch({ choices: [] });
    const provider = new OpenAICompatibleProvider("KEY", undefined, undefined, 0, fetchFn);
    await expect(provider.review("x")).rejects.toThrow(/no content/i);
  });

  it("sends temperature in the body", async () => {
    const fetchFn = fakeFetch({ choices: [{ message: { content: "[]" } }] });
    const provider = new OpenAICompatibleProvider("KEY", "gpt-4o-mini", "https://api.openai.com/v1", 0, fetchFn);
    await provider.review("p");
    expect(JSON.parse((fetchFn as any).mock.calls[0][1].body).temperature).toBe(0);
  });
});

describe("OpenAICompatibleProvider.chat", () => {
  function chatProvider(fetchFn: typeof fetch) {
    return new OpenAICompatibleProvider("KEY", "gpt-4o-mini", "https://api.openai.com/v1", 0, fetchFn);
  }

  it("maps tool specs into OpenAI function tools", async () => {
    const fetchFn = fakeFetch({ choices: [{ message: { content: "ok" } }] });
    await chatProvider(fetchFn).chat([{ role: "user", content: "hi" }], TOOLS);
    const body = JSON.parse((fetchFn as any).mock.calls[0][1].body);
    expect(body.tools[0]).toEqual({
      type: "function",
      function: { name: "read_file", description: "read a file", parameters: { type: "object" } },
    });
    expect(body.messages[0]).toEqual({ role: "user", content: "hi" });
  });

  it("parses tool_calls in the response into IToolCall[] with object input", async () => {
    const fetchFn = fakeFetch({
      choices: [{ message: { content: null, tool_calls: [
        { id: "call_1", type: "function", function: { name: "read_file", arguments: '{"path":"x.ts"}' } },
      ] } }],
    });
    const turn = await chatProvider(fetchFn).chat([{ role: "user", content: "hi" }], TOOLS);
    expect(turn.text).toBeUndefined();
    expect(turn.toolCalls).toEqual([{ id: "call_1", name: "read_file", input: { path: "x.ts" } }]);
  });

  it("keeps both assistant text and tool_calls when present", async () => {
    const fetchFn = fakeFetch({
      choices: [{ message: { content: "thinking", tool_calls: [
        { id: "call_2", type: "function", function: { name: "grep", arguments: "{}" } },
      ] } }],
    });
    const turn = await chatProvider(fetchFn).chat([{ role: "user", content: "hi" }], TOOLS);
    expect(turn.text).toBe("thinking");
    expect(turn.toolCalls[0].name).toBe("grep");
  });

  it("falls back to {} on malformed tool-call arguments", async () => {
    const fetchFn = fakeFetch({
      choices: [{ message: { content: null, tool_calls: [
        { id: "call_3", type: "function", function: { name: "read_file", arguments: "{not json" } },
      ] } }],
    });
    const turn = await chatProvider(fetchFn).chat([{ role: "user", content: "hi" }], TOOLS);
    expect(turn.toolCalls[0].input).toEqual({});
  });

  it("serializes an assistant tool_use turn into content + tool_calls", async () => {
    const fetchFn = fakeFetch({ choices: [{ message: { content: "ok" } }] });
    const messages: IMessage[] = [
      { role: "user", content: "review" },
      { role: "assistant", content: [
        { type: "text", text: "let me look" },
        { type: "tool_use", id: "call_9", name: "read_file", input: { path: "x.ts" } },
      ] },
      { role: "user", content: [{ type: "tool_result", toolCallId: "call_9", content: "file body" }] },
    ];
    await chatProvider(fetchFn).chat(messages, TOOLS);
    const sent = JSON.parse((fetchFn as any).mock.calls[0][1].body).messages;
    expect(sent[1]).toEqual({
      role: "assistant",
      content: "let me look",
      tool_calls: [{ id: "call_9", type: "function", function: { name: "read_file", arguments: '{"path":"x.ts"}' } }],
    });
    expect(sent[2]).toEqual({ role: "tool", tool_call_id: "call_9", content: "file body" });
  });

  it("expands multiple tool_result blocks into separate tool messages", async () => {
    const fetchFn = fakeFetch({ choices: [{ message: { content: "ok" } }] });
    const messages: IMessage[] = [
      { role: "user", content: [
        { type: "tool_result", toolCallId: "call_a", content: "A" },
        { type: "tool_result", toolCallId: "call_b", content: "B" },
      ] },
    ];
    await chatProvider(fetchFn).chat(messages, TOOLS);
    const sent = JSON.parse((fetchFn as any).mock.calls[0][1].body).messages;
    expect(sent).toEqual([
      { role: "tool", tool_call_id: "call_a", content: "A" },
      { role: "tool", tool_call_id: "call_b", content: "B" },
    ]);
  });

  it("marks failed tool results with an [ERROR] prefix", async () => {
    const fetchFn = fakeFetch({ choices: [{ message: { content: "ok" } }] });
    const messages: IMessage[] = [
      { role: "user", content: [
        { type: "tool_result", toolCallId: "call_e", content: "boom", isError: true },
      ] },
    ];
    await chatProvider(fetchFn).chat(messages, TOOLS);
    const sent = JSON.parse((fetchFn as any).mock.calls[0][1].body).messages;
    expect(sent[0]).toEqual({ role: "tool", tool_call_id: "call_e", content: "[ERROR] boom" });
  });

  it("sets content null when an assistant turn has only tool calls", async () => {
    const fetchFn = fakeFetch({ choices: [{ message: { content: "ok" } }] });
    const messages: IMessage[] = [
      { role: "assistant", content: [
        { type: "tool_use", id: "call_x", name: "grep", input: { pattern: "foo" } },
      ] },
    ];
    await chatProvider(fetchFn).chat(messages, TOOLS);
    const sent = JSON.parse((fetchFn as any).mock.calls[0][1].body).messages;
    expect(sent[0].content).toBeNull();
  });

  it("forces a tool via tool_choice when forceTool is set", async () => {
    const fetchFn = fakeFetch({ choices: [{ message: { content: null, tool_calls: [
      { id: "c", type: "function", function: { name: "submit_review", arguments: "{}" } },
    ] } }] });
    await chatProvider(fetchFn).chat([{ role: "user", content: "hi" }], TOOLS, { forceTool: "submit_review" });
    const body = JSON.parse((fetchFn as any).mock.calls[0][1].body);
    expect(body.tool_choice).toEqual({ type: "function", function: { name: "submit_review" } });
  });

  it("omits tool_choice when no forceTool is given", async () => {
    const fetchFn = fakeFetch({ choices: [{ message: { content: "ok" } }] });
    await chatProvider(fetchFn).chat([{ role: "user", content: "hi" }], TOOLS);
    expect(JSON.parse((fetchFn as any).mock.calls[0][1].body).tool_choice).toBeUndefined();
  });

  it("throws an empty-response error when there is neither text nor tool calls", async () => {
    const fetchFn = fakeFetch({ choices: [{ message: { content: null } }] });
    await expect(chatProvider(fetchFn).chat([{ role: "user", content: "hi" }], TOOLS)).rejects.toThrow(/no content/i);
  });

  it("sends temperature in the chat body", async () => {
    const fetchFn = fakeFetch({ choices: [{ message: { content: "ok" } }] });
    const provider = new OpenAICompatibleProvider("KEY", "gpt-4o-mini", "https://api.openai.com/v1", 0.5, fetchFn);
    await provider.chat([{ role: "user", content: "hi" }], TOOLS);
    expect(JSON.parse((fetchFn as any).mock.calls[0][1].body).temperature).toBe(0.5);
  });
});
