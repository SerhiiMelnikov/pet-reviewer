import { describe, it, expect } from "vitest";
import { validateConfig, resolveSettings, DEFAULT_IGNORE } from "../src/config";

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

  it("accepts a valid temperature", () => {
    expect(validateConfig({ temperature: 0 })).toEqual({ temperature: 0 });
    expect(validateConfig({ temperature: 0.7 })).toEqual({ temperature: 0.7 });
  });

  it("throws on an out-of-range or non-number temperature", () => {
    expect(() => validateConfig({ temperature: 2 })).toThrow(/temperature/);
    expect(() => validateConfig({ temperature: -1 })).toThrow(/temperature/);
    expect(() => validateConfig({ temperature: "hot" })).toThrow(/temperature/);
  });

  it("accepts a valid timeout", () => {
    expect(() => validateConfig({ timeout: 900 })).not.toThrow();
  });

  it("rejects a non-positive or non-integer timeout", () => {
    expect(() => validateConfig({ timeout: 0 })).toThrow(/timeout/);
    expect(() => validateConfig({ timeout: -5 })).toThrow(/timeout/);
    expect(() => validateConfig({ timeout: 1.5 })).toThrow(/timeout/);
  });

  it("resolves timeout: cli over config, undefined when unset", () => {
    expect(resolveSettings({ timeout: 600 }, { timeout: 300 }, {}).timeout).toBe(600);
    expect(resolveSettings({}, { timeout: 300 }, {}).timeout).toBe(300);
    expect(resolveSettings({}, {}, {}).timeout).toBeUndefined();
  });

  it("accepts an ignore array and ignoreDefaults boolean", () => {
    expect(() => validateConfig({ ignore: ["dist/**"], ignoreDefaults: false })).not.toThrow();
  });

  it("rejects a non-array ignore", () => {
    expect(() => validateConfig({ ignore: "dist/**" })).toThrow(/ignore .* must be an array/);
  });

  it("rejects a non-string element in ignore", () => {
    expect(() => validateConfig({ ignore: ["ok", 123] })).toThrow(/ignore .* must be an array/);
  });

  it("rejects a non-boolean ignoreDefaults", () => {
    expect(() => validateConfig({ ignoreDefaults: "yes" })).toThrow(/ignoreDefaults .* must be a boolean/);
  });
});

describe("resolveSettings", () => {
  it("resolves ignore to defaults merged with config patterns", () => {
    const settings = resolveSettings({}, { ignore: ["custom/**"] }, {});
    expect(settings.ignore).toEqual([...DEFAULT_IGNORE, "custom/**"]);
  });

  it("resolves ignore to exactly the defaults when nothing is configured", () => {
    const settings = resolveSettings({}, {}, {});
    expect(settings.ignore).toEqual(DEFAULT_IGNORE);
  });

  it("keeps defaults when ignoreDefaults is explicitly true", () => {
    const settings = resolveSettings({}, { ignore: ["custom/**"], ignoreDefaults: true }, {});
    expect(settings.ignore).toEqual([...DEFAULT_IGNORE, "custom/**"]);
  });

  it("drops defaults when ignoreDefaults is false", () => {
    const settings = resolveSettings({}, { ignore: ["custom/**"], ignoreDefaults: false }, {});
    expect(settings.ignore).toEqual(["custom/**"]);
  });

  it("suppresses all filtering when ignoreDefaults is false and no patterns are given", () => {
    const settings = resolveSettings({}, { ignoreDefaults: false }, {});
    expect(settings.ignore).toEqual([]);
  });
});
