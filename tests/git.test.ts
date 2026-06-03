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
});
