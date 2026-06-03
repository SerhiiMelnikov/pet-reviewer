import { describe, it, expect, vi } from "vitest";
import { GeminiProvider } from "../src/providers/gemini";
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

// fetch stub that returns a different response per call (for multi-turn tests)
function sequenceFetch(...bodies: unknown[]) {
  const fn = vi.fn();
  for (const body of bodies) {
    fn.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(body) });
  }
  return fn as unknown as typeof fetch;
}

describe("GeminiProvider", () => {
  it("sends the prompt to the native endpoint and returns the text", async () => {
    const fetchFn = fakeFetch({
      candidates: [{ content: { parts: [{ text: "[1,2]" }] } }],
    });
    const provider = new GeminiProvider(
      "KEY",
      "gemini-2.5-flash",
      "https://generativelanguage.googleapis.com",
      fetchFn,
    );
    const result = await provider.review("MY_PROMPT");

    expect(result).toBe("[1,2]");
    const [url, init] = (fetchFn as any).mock.calls[0];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    );
    expect(init.headers["x-goog-api-key"]).toBe("KEY");
    const body = JSON.parse(init.body);
    expect(body.contents[0].parts[0].text).toBe("MY_PROMPT");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("throws a clear error on a non-ok response", async () => {
    const fetchFn = fakeFetch({}, false, 403);
    const provider = new GeminiProvider("KEY", undefined, undefined, fetchFn);
    await expect(provider.review("x")).rejects.toThrow(/403/);
  });

  it("throws a friendly error when the connection fails", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValue(new Error("fetch failed")) as unknown as typeof fetch;
    const provider = new GeminiProvider("KEY", undefined, undefined, fetchFn);
    await expect(provider.review("x")).rejects.toThrow(/reach Gemini/);
  });

  it("throws a timeout error when the request is aborted", async () => {
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    const fetchFn = vi
      .fn()
      .mockRejectedValue(abortErr) as unknown as typeof fetch;
    const provider = new GeminiProvider("KEY", undefined, undefined, fetchFn);
    await expect(provider.review("x")).rejects.toThrow(/timed out/);
  });

  it("throws when the response has no candidates", async () => {
    const fetchFn = fakeFetch({ candidates: [] });
    const provider = new GeminiProvider("KEY", undefined, undefined, fetchFn);
    await expect(provider.review("x")).rejects.toThrow(/no content/i);
  });
});

describe("GeminiProvider.chat", () => {
  it("maps a functionCall part to a tool call with a name-encoded id", async () => {
    const fetchFn = fakeFetch({
      candidates: [
        { content: { parts: [{ functionCall: { name: "read_file", args: { path: "x.ts" } } }] } },
      ],
    });
    const provider = new GeminiProvider("KEY", "gemini-2.5-flash", undefined, fetchFn);
    const turn = await provider.chat([{ role: "user", content: "hi" }], TOOLS);

    expect(turn.toolCalls).toEqual([
      { id: "read_file__0", name: "read_file", input: { path: "x.ts" } },
    ]);
    expect(turn.text).toBeUndefined();
  });

  it("maps a text-only part to turn.text with no tool calls", async () => {
    const fetchFn = fakeFetch({ candidates: [{ content: { parts: [{ text: "hello" }] } }] });
    const provider = new GeminiProvider("KEY", "gemini-2.5-flash", undefined, fetchFn);
    const turn = await provider.chat([{ role: "user", content: "hi" }], TOOLS);

    expect(turn.text).toBe("hello");
    expect(turn.toolCalls).toEqual([]);
  });

  it("sends functionDeclarations and no responseMimeType, mapping the user role", async () => {
    const fetchFn = fakeFetch({ candidates: [{ content: { parts: [{ text: "x" }] } }] });
    const provider = new GeminiProvider("KEY", "gemini-2.5-flash", undefined, fetchFn);
    await provider.chat([{ role: "user", content: "hi" }], TOOLS);

    const init = (fetchFn as any).mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(body.tools[0].functionDeclarations[0].name).toBe("read_file");
    expect(body.tools[0].functionDeclarations[0].parameters).toEqual({ type: "object" });
    expect(body.generationConfig?.responseMimeType).toBeUndefined();
    expect(body.contents[0]).toEqual({ role: "user", parts: [{ text: "hi" }] });
  });

  it("round-trips a tool result back as a functionResponse with the decoded name", async () => {
    const fetchFn = sequenceFetch(
      { candidates: [{ content: { parts: [{ functionCall: { name: "read_file", args: { path: "x.ts" } } }] } }] },
      { candidates: [{ content: { parts: [{ text: "done" }] } }] },
    );
    const provider = new GeminiProvider("KEY", "gemini-2.5-flash", undefined, fetchFn);

    const turn1 = await provider.chat([{ role: "user", content: "review" }], TOOLS);
    expect(turn1.toolCalls[0].id).toBe("read_file__0");

    const messages: IMessage[] = [
      { role: "user", content: "review" },
      { role: "assistant", content: [{ type: "tool_use", id: "read_file__0", name: "read_file", input: { path: "x.ts" } }] },
      { role: "user", content: [{ type: "tool_result", toolCallId: "read_file__0", content: "file body" }] },
    ];
    await provider.chat(messages, TOOLS);

    const body = JSON.parse((fetchFn as any).mock.calls[1][1].body);
    expect(body.contents[1]).toEqual({
      role: "model",
      parts: [{ functionCall: { name: "read_file", args: { path: "x.ts" } } }],
    });
    expect(body.contents[2]).toEqual({
      role: "user",
      parts: [{ functionResponse: { name: "read_file", response: { content: "file body" } } }],
    });
  });

  it("converts nullable union types in tool schemas to Gemini's nullable form", async () => {
    const fetchFn = fakeFetch({ candidates: [{ content: { parts: [{ text: "x" }] } }] });
    const provider = new GeminiProvider("KEY", "gemini-2.5-flash", undefined, fetchFn);
    const tools: IToolSpec[] = [
      {
        name: "submit_review",
        description: "submit",
        inputSchema: {
          type: "object",
          properties: {
            line: { type: ["number", "null"] },
            note: { type: ["string", "null"] },
            name: { type: "string" },
          },
        },
      },
    ];
    await provider.chat([{ role: "user", content: "hi" }], tools);

    const body = JSON.parse((fetchFn as any).mock.calls[0][1].body);
    const params = body.tools[0].functionDeclarations[0].parameters;
    expect(params.properties.line).toEqual({ type: "number", nullable: true });
    expect(params.properties.note).toEqual({ type: "string", nullable: true });
    expect(params.properties.name).toEqual({ type: "string" });
  });

  it("forces a function call via toolConfig when forceTool is set", async () => {
    const fetchFn = fakeFetch({
      candidates: [{ content: { parts: [{ functionCall: { name: "submit_review", args: {} } }] } }],
    });
    const provider = new GeminiProvider("KEY", "gemini-2.5-flash", undefined, fetchFn);

    await provider.chat([{ role: "user", content: "hi" }], TOOLS, { forceTool: "submit_review" });

    const body = JSON.parse((fetchFn as any).mock.calls[0][1].body);
    expect(body.toolConfig).toEqual({
      functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["submit_review"] },
    });
  });

  it("omits toolConfig when no forceTool is given", async () => {
    const fetchFn = fakeFetch({ candidates: [{ content: { parts: [{ text: "x" }] } }] });
    const provider = new GeminiProvider("KEY", "gemini-2.5-flash", undefined, fetchFn);

    await provider.chat([{ role: "user", content: "hi" }], TOOLS);

    const body = JSON.parse((fetchFn as any).mock.calls[0][1].body);
    expect(body.toolConfig).toBeUndefined();
  });

  it("maps an error tool result to an { error } functionResponse", async () => {
    const fetchFn = fakeFetch({ candidates: [{ content: { parts: [{ text: "x" }] } }] });
    const provider = new GeminiProvider("KEY", "gemini-2.5-flash", undefined, fetchFn);
    const messages: IMessage[] = [
      { role: "user", content: [{ type: "tool_result", toolCallId: "read_file__0", content: "boom", isError: true }] },
    ];
    await provider.chat(messages, TOOLS);

    const body = JSON.parse((fetchFn as any).mock.calls[0][1].body);
    expect(body.contents[0].parts[0].functionResponse.response).toEqual({ error: "boom" });
  });
});
