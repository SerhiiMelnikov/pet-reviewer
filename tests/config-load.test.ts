import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, resolveSettings } from "../src/config";

function tempProject(configSource?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "rev-"));
  writeFileSync(join(dir, "package.json"), '{"type":"module"}');
  if (configSource !== undefined) {
    writeFileSync(join(dir, "reviewer.config.js"), configSource);
  }
  return dir;
}

describe("loadConfig", () => {
  it("loads an existing config file", async () => {
    const dir = tempProject('export default { provider: "ollama" };');
    const config = await loadConfig(dir);
    expect(config.provider).toBe("ollama");
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns an empty object when no config file exists", async () => {
    const dir = tempProject();
    const config = await loadConfig(dir);
    expect(config).toEqual({});
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("resolveSettings", () => {
  const env = { ANTHROPIC_API_KEY: "env-key" };

  it("uses defaults when nothing is set", () => {
    const s = resolveSettings({}, {}, env);
    expect(s.provider).toBe("claude");
    expect(s.blockLevel).toBe("warning");
    expect(s.skip).toEqual([]);
    expect(s.apiKey).toBe("env-key");
  });

  it("config overrides defaults", () => {
    const config = {
      provider: "ollama",
      providers: { ollama: { model: "qwen", baseUrl: "http://x:1" } },
      commit: { blockLevel: "critical" as const, skip: ["style" as const] },
    };
    const s = resolveSettings({}, config, env);
    expect(s.provider).toBe("ollama");
    expect(s.model).toBe("qwen");
    expect(s.baseUrl).toBe("http://x:1");
    expect(s.blockLevel).toBe("critical");
    expect(s.skip).toEqual(["style"]);
  });

  it("CLI overrides config", () => {
    const config = { provider: "ollama", commit: { blockLevel: "nit" as const } };
    const s = resolveSettings(
      { provider: "claude", blockLevel: "critical", skip: ["bug"] },
      config,
      env,
    );
    expect(s.provider).toBe("claude");
    expect(s.blockLevel).toBe("critical");
    expect(s.skip).toEqual(["bug"]);
  });

  it("prefers the config apiKey over the environment", () => {
    const config = { providers: { claude: { apiKey: "config-key" } } };
    expect(resolveSettings({}, config, env).apiKey).toBe("config-key");
  });

  it("carries rules from config (defaulting to [])", () => {
    expect(resolveSettings({}, {}, env).rules).toEqual([]);
    const rules = [{ text: "No any", severity: "warning" as const }];
    expect(resolveSettings({}, { rules }, env).rules).toEqual(rules);
  });
});
