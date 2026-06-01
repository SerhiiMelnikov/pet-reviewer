import { describe, it, expect, vi } from "vitest";
import { GeminiProvider } from "../src/providers/gemini";

function fakeFetch(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
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
