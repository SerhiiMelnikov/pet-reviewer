import { describe, it, expect, vi } from "vitest";
import { createCommit } from "../src/commit";

describe("createCommit", () => {
  it("stages all changes, then commits with the message", () => {
    const run = vi.fn().mockReturnValue("");
    createCommit("feat: add thing", run);

    expect(run).toHaveBeenNthCalledWith(1, "git", ["add", "-A"]);
    expect(run).toHaveBeenNthCalledWith(2, "git", ["commit", "-m", "feat: add thing"]);
  });
});
