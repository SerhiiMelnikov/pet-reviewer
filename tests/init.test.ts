import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initConfig } from "../src/init";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "rev-init-"));
}

describe("initConfig", () => {
  it("writes a starter config and returns its path", () => {
    const dir = tempDir();
    const path = initConfig(dir);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("export default");
    rmSync(dir, { recursive: true, force: true });
  });

  it("includes a gemini provider block in the template", () => {
    const dir = tempDir();
    const path = initConfig(dir);
    expect(readFileSync(path, "utf8")).toContain("gemini");
    rmSync(dir, { recursive: true, force: true });
  });

  it("refuses to overwrite an existing file without force", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "reviewer.config.js"), "old");
    expect(() => initConfig(dir)).toThrow(/already exists/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("overwrites with force", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "reviewer.config.js"), "old");
    initConfig(dir, true);
    expect(readFileSync(join(dir, "reviewer.config.js"), "utf8")).toContain("export default");
    rmSync(dir, { recursive: true, force: true });
  });
});
