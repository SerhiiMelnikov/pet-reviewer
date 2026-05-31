import { describe, it, expect, vi } from "vitest";
import { OllamaProvider } from "../src/providers/ollama";

function fakeFetch(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

describe("OllamaProvider", () => {
  it("sends the prompt and returns the response field", async () => {
    const fetchFn = fakeFetch({ response: "[1,2]" });
    const provider = new OllamaProvider("llama3.2", "http://localhost:11434", fetchFn);
    const result = await provider.review("MY_PROMPT");

    expect(result).toBe("[1,2]");
    const [url, init] = (fetchFn as any).mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/generate");
    expect(JSON.parse(init.body).prompt).toBe("MY_PROMPT");
    expect(JSON.parse(init.body).stream).toBe(false);
  });

  it("throws a clear error on a non-ok response", async () => {
    const fetchFn = fakeFetch({}, false, 500);
    const provider = new OllamaProvider("llama3.2", "http://localhost:11434", fetchFn);
    await expect(provider.review("x")).rejects.toThrow(/500/);
  });

  it("throws a friendly error when the connection fails", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("fetch failed")) as unknown as typeof fetch;
    const provider = new OllamaProvider("llama3.2", "http://localhost:11434", fetchFn);
    await expect(provider.review("x")).rejects.toThrow(/ollama serve/);
  });

  it("throws a timeout error when the request is aborted", async () => {
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    const fetchFn = vi.fn().mockRejectedValue(abortErr) as unknown as typeof fetch;
    const provider = new OllamaProvider("llama3.2", "http://localhost:11434", fetchFn);
    await expect(provider.review("x")).rejects.toThrow(/timed out/);
  });
});
