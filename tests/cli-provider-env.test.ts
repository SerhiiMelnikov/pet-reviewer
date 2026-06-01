import { describe, it, expect } from "vitest";
import { providerEnv } from "../src/cli";

describe("providerEnv", () => {
  it("maps the gemini key to GEMINI_API_KEY", () => {
    expect(providerEnv("gemini", "g-key")).toEqual({ GEMINI_API_KEY: "g-key" });
  });

  it("maps the claude key to ANTHROPIC_API_KEY", () => {
    expect(providerEnv("claude", "a-key")).toEqual({ ANTHROPIC_API_KEY: "a-key" });
  });

  it("defaults a keyless provider to the ANTHROPIC_API_KEY slot", () => {
    expect(providerEnv("ollama", undefined)).toEqual({ ANTHROPIC_API_KEY: undefined });
  });
});
