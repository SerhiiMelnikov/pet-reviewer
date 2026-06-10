import { describe, it, expect, vi } from "vitest";
import { getDiff } from "../src/git";

describe("getDiff", () => {
  it("calls `git diff HEAD` and returns the output", () => {
    const run = vi.fn().mockReturnValue("diff --git a/x b/x\n+change");
    const result = getDiff(run);
    expect(run).toHaveBeenCalledWith("git", ["diff", "HEAD"]);
    expect(result).toBe("diff --git a/x b/x\n+change");
  });

  it("returns an empty string when there are no changes", () => {
    const run = vi.fn().mockReturnValue("");
    expect(getDiff(run)).toBe("");
  });

  it("calls `git diff <base>...HEAD` when a base is given", () => {
    const run = vi.fn().mockReturnValue("diff");
    const result = getDiff(run, "main");
    expect(run).toHaveBeenCalledWith("git", ["diff", "main...HEAD"]);
    expect(result).toBe("diff");
  });

  it("appends exclude pathspecs when ignore patterns are given", () => {
    const run = vi.fn().mockReturnValue("diff");
    getDiff(run, undefined, ["dist/**", "package-lock.json"]);
    expect(run).toHaveBeenCalledWith("git", [
      "diff",
      "HEAD",
      "--",
      ".",
      ":(exclude,glob)dist/**",
      ":(exclude,glob)package-lock.json",
    ]);
  });

  it("combines a base ref with exclude pathspecs", () => {
    const run = vi.fn().mockReturnValue("diff");
    getDiff(run, "main", ["*.snap"]);
    expect(run).toHaveBeenCalledWith("git", [
      "diff",
      "main...HEAD",
      "--",
      ".",
      ":(exclude,glob)*.snap",
    ]);
  });

  it("omits the pathspec separator when ignore is empty", () => {
    const run = vi.fn().mockReturnValue("diff");
    getDiff(run, undefined, []);
    expect(run).toHaveBeenCalledWith("git", ["diff", "HEAD"]);
  });
});
