import { describe, it, expect, vi } from "vitest";
import { OpenAICompatibleProvider } from "../src/providers/openai";

function fakeFetch(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

describe("OpenAICompatibleProvider", () => {
  it("sends the prompt to /chat/completions and returns the content", async () => {
    const fetchFn = fakeFetch({
      choices: [{ message: { content: "[1,2]" } }],
    });
    const provider = new OpenAICompatibleProvider(
      "KEY",
      "gpt-4o-mini",
      "https://api.openai.com/v1",
      fetchFn,
    );
    const result = await provider.review("MY_PROMPT");

    expect(result).toBe("[1,2]");
    const [url, init] = (fetchFn as any).mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.headers["Authorization"]).toBe("Bearer KEY");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages[0].content).toBe("MY_PROMPT");
    expect(body.response_format).toBeUndefined();
  });

  it("throws a clear error on a non-ok response", async () => {
    const fetchFn = fakeFetch({}, false, 401);
    const provider = new OpenAICompatibleProvider("KEY", undefined, undefined, fetchFn);
    await expect(provider.review("x")).rejects.toThrow(/401/);
  });

  it("throws a friendly error when the connection fails", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValue(new Error("fetch failed")) as unknown as typeof fetch;
    const provider = new OpenAICompatibleProvider("KEY", undefined, undefined, fetchFn);
    await expect(provider.review("x")).rejects.toThrow(/reach OpenAI/);
  });

  it("throws a timeout error when the request is aborted", async () => {
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    const fetchFn = vi
      .fn()
      .mockRejectedValue(abortErr) as unknown as typeof fetch;
    const provider = new OpenAICompatibleProvider("KEY", undefined, undefined, fetchFn);
    await expect(provider.review("x")).rejects.toThrow(/timed out/);
  });

  it("throws when the response has no choices", async () => {
    const fetchFn = fakeFetch({ choices: [] });
    const provider = new OpenAICompatibleProvider("KEY", undefined, undefined, fetchFn);
    await expect(provider.review("x")).rejects.toThrow(/no content/i);
  });
});
