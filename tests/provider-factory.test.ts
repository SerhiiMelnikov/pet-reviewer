import { describe, it, expect } from "vitest";
import { getProvider, getAgentProvider } from "../src/providers";
import { OllamaProvider } from "../src/providers/ollama";
import { ClaudeProvider } from "../src/providers/claude";
import { GeminiProvider } from "../src/providers/gemini";
import { OpenAICompatibleProvider } from "../src/providers/openai";

describe("getProvider", () => {
  it("returns OllamaProvider for 'ollama'", () => {
    expect(getProvider("ollama", {})).toBeInstanceOf(OllamaProvider);
  });

  it("returns ClaudeProvider when the key is present", () => {
    const provider = getProvider("claude", { ANTHROPIC_API_KEY: "abc" });
    expect(provider).toBeInstanceOf(ClaudeProvider);
  });

  it("is case-insensitive for the provider name", () => {
    expect(getProvider("OLLAMA", {})).toBeInstanceOf(OllamaProvider);
    expect(getProvider("Claude", { ANTHROPIC_API_KEY: "abc" })).toBeInstanceOf(
      ClaudeProvider,
    );
  });

  it("throws a clear error for 'claude' without a key", () => {
    expect(() => getProvider("claude", {})).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("throws for an unknown provider", () => {
    expect(() => getProvider("gpt", {})).toThrow();
  });

  it("returns GeminiProvider when the key is present", () => {
    const provider = getProvider("gemini", { GEMINI_API_KEY: "abc" });
    expect(provider).toBeInstanceOf(GeminiProvider);
  });

  it("throws a clear error for 'gemini' without a key", () => {
    expect(() => getProvider("gemini", {})).toThrow(/GEMINI_API_KEY/);
  });

  it("passes model through to GeminiProvider", () => {
    const p = getProvider("gemini", { GEMINI_API_KEY: "k" }, {
      model: "gemini-2.5-pro",
    }) as GeminiProvider;
    expect(p.model).toBe("gemini-2.5-pro");
  });

  it("returns OpenAICompatibleProvider when the key is present", () => {
    const provider = getProvider("openai-compatible", { OPENAI_API_KEY: "abc" });
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it("throws a clear error for 'openai-compatible' without a key", () => {
    expect(() => getProvider("openai-compatible", {})).toThrow(/OPENAI_API_KEY/);
  });

  it("passes model and baseUrl through to OpenAICompatibleProvider", () => {
    const p = getProvider("openai-compatible", { OPENAI_API_KEY: "k" }, {
      model: "llama-3.3-70b-versatile",
      baseUrl: "https://api.groq.com/openai/v1",
    }) as OpenAICompatibleProvider;
    expect(p.model).toBe("llama-3.3-70b-versatile");
    expect(p.baseUrl).toBe("https://api.groq.com/openai/v1");
  });

  it("passes model and baseUrl through to OllamaProvider", () => {
    const p = getProvider("ollama", {}, {
      model: "qwen2.5-coder",
      baseUrl: "http://host:1234",
    }) as OllamaProvider;
    expect(p.model).toBe("qwen2.5-coder");
    expect(p.baseUrl).toBe("http://host:1234");
  });

  it("passes model through to ClaudeProvider", () => {
    const p = getProvider("claude", { ANTHROPIC_API_KEY: "k" }, {
      model: "claude-sonnet-4-6",
    }) as ClaudeProvider;
    expect(p.model).toBe("claude-sonnet-4-6");
  });

  it("uses provider defaults when no options are given", () => {
    const ollama = getProvider("ollama", {}) as OllamaProvider;
    expect(ollama.model).toBe("llama3.2");
    expect(ollama.baseUrl).toBe("http://localhost:11434");

    const claude = getProvider("claude", { ANTHROPIC_API_KEY: "k" }) as ClaudeProvider;
    expect(claude.model).toBe("claude-haiku-4-5-20251001");
  });
});

describe("getAgentProvider", () => {
  it("returns a Claude-based agent provider when the key is present", () => {
    const p = getAgentProvider("claude", { ANTHROPIC_API_KEY: "k" });
    expect(p).toBeInstanceOf(ClaudeProvider);
  });

  it("throws for a non-claude provider", () => {
    expect(() => getAgentProvider("gemini", { GEMINI_API_KEY: "k" })).toThrow(/Claude/);
  });

  it("throws when the Claude key is missing", () => {
    expect(() => getAgentProvider("claude", {})).toThrow(/ANTHROPIC_API_KEY/);
  });
});
