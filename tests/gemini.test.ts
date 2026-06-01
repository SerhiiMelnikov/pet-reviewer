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
});
