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
});
