import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveInRoot } from "../src/tools/sandbox";
import { readFileTool } from "../src/tools/readFile";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tools-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "a.ts"), "hello world");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("resolveInRoot", () => {
  it("resolves a path inside root", () => {
    expect(resolveInRoot(root, "src/a.ts")).toBe(join(root, "src", "a.ts"));
  });
  it("throws when the path escapes root", () => {
    expect(() => resolveInRoot(root, "../escape")).toThrow(/escapes/);
  });
});

describe("readFileTool", () => {
  it("reads a file within the root", async () => {
    expect(await readFileTool.execute({ path: "src/a.ts" }, root)).toBe("hello world");
  });
  it("throws on a missing file", async () => {
    await expect(readFileTool.execute({ path: "src/missing.ts" }, root)).rejects.toThrow(/not found/i);
  });
  it("throws on traversal", async () => {
    await expect(readFileTool.execute({ path: "../../etc/passwd" }, root)).rejects.toThrow(/escapes/);
  });
});
