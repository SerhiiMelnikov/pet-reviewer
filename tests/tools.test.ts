import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveInRoot } from "../src/tools/sandbox";
import { readFileTool } from "../src/tools/readFile";
import { makeGrepTool } from "../src/tools/grep";
import { listDirTool } from "../src/tools/listDir";
import { AGENT_TOOLS, SUBMIT_REVIEW_SPEC, ALL_TOOL_SPECS } from "../src/tools/index";

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

describe("makeGrepTool", () => {
  it("returns matches from the runner", async () => {
    const fakeRun = (_cmd: string, _args: string[]) => "src/a.ts:1:hello";
    const out = await makeGrepTool(fakeRun).execute({ pattern: "hello" }, root);
    expect(out).toContain("src/a.ts:1:hello");
  });
  it("reports no matches when the runner throws", async () => {
    const fakeRun = () => {
      throw new Error("exit 1");
    };
    expect(await makeGrepTool(fakeRun).execute({ pattern: "zzz" }, root)).toMatch(/no matches/i);
  });
  it("runs git grep with extended regex (-E before -e)", async () => {
    let captured: string[] = [];
    const fakeRun = (_cmd: string, args: string[]) => {
      captured = args;
      return "src/a.ts:1:hit";
    };
    await makeGrepTool(fakeRun).execute({ pattern: "first\\(" }, root);
    expect(captured).toContain("-E");
    expect(captured.indexOf("-E")).toBeLessThan(captured.indexOf("-e"));
  });
});

describe("listDirTool", () => {
  it("lists directory entries", async () => {
    const out = await listDirTool.execute({ path: "src" }, root);
    expect(out).toContain("a.ts");
  });
  it("throws when the directory is missing", async () => {
    await expect(listDirTool.execute({ path: "nope" }, root)).rejects.toThrow(/not found/i);
  });
  it("throws on traversal", async () => {
    await expect(listDirTool.execute({ path: "../.." }, root)).rejects.toThrow(/escapes/);
  });
});

describe("the tool registry", () => {
  it("exposes the three executable tools and the submit spec", () => {
    expect(AGENT_TOOLS.map((t) => t.spec.name).sort()).toEqual(["grep", "list_dir", "read_file"]);
    expect(SUBMIT_REVIEW_SPEC.name).toBe("submit_review");
    expect(ALL_TOOL_SPECS.map((s) => s.name)).toContain("submit_review");
  });
});
