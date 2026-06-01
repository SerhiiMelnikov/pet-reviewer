import { describe, it, expect } from "vitest";
import { validateConfig } from "../src/config";

describe("validateConfig", () => {
  it("accepts an empty object", () => {
    expect(validateConfig({})).toEqual({});
  });

  it("accepts a full valid config", () => {
    const cfg = {
      provider: "ollama",
      providers: { ollama: { model: "qwen", baseUrl: "http://x:1" } },
      commit: { blockLevel: "critical", skip: ["style"] },
    };
    expect(validateConfig(cfg)).toEqual(cfg);
  });

  it("throws when the export is not an object", () => {
    expect(() => validateConfig(null)).toThrow();
    expect(() => validateConfig("nope")).toThrow();
  });

  it("throws on an invalid provider", () => {
    expect(() => validateConfig({ provider: "gpt" })).toThrow(/provider/);
  });

  it("accepts provider 'gemini'", () => {
    const cfg = { provider: "gemini", providers: { gemini: { model: "gemini-2.5-flash" } } };
    expect(validateConfig(cfg)).toEqual(cfg);
  });

  it("accepts provider 'openai-compatible'", () => {
    const cfg = {
      provider: "openai-compatible",
      providers: { "openai-compatible": { model: "gpt-4o-mini" } },
    };
    expect(validateConfig(cfg)).toEqual(cfg);
  });

  it("throws on an invalid blockLevel", () => {
    expect(() => validateConfig({ commit: { blockLevel: "loud" } })).toThrow(/blockLevel/);
  });

  it("throws on an invalid skip category", () => {
    expect(() => validateConfig({ commit: { skip: ["bogus"] } })).toThrow(/skip/);
  });

  it("accepts valid rules", () => {
    const cfg = { rules: [{ text: "No console.log", severity: "warning" }] };
    expect(validateConfig(cfg)).toEqual(cfg);
  });

  it("throws on a rule with an invalid severity", () => {
    expect(() => validateConfig({ rules: [{ text: "x", severity: "loud" }] })).toThrow(/rules\[0\]/);
  });

  it("throws on a rule whose text is too long", () => {
    const long = "a".repeat(501);
    expect(() => validateConfig({ rules: [{ text: long, severity: "nit" }] })).toThrow(/rules\[0\]/);
  });

  it("throws when rules is not an array", () => {
    expect(() => validateConfig({ rules: "nope" })).toThrow(/rules/);
  });
});
