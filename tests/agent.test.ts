import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgent } from "../src/agent";
import { IAgentProvider, IAgentTurn } from "../src/providers/types";

function scripted(turns: IAgentTurn[]): IAgentProvider {
  let i = 0;
  return { async chat() { return turns[i++] ?? { toolCalls: [] }; } };
}

const validReview = {
  findings: [
    { file: "a.ts", line: 1, severity: "nit", category: "style", message: "m", suggestion: null },
  ],
  commitMessage: "chore: x",
};

describe("runAgent", () => {
  it("returns the normalized review when the model calls submit_review", async () => {
    const provider = scripted([{ toolCalls: [{ id: "s1", name: "submit_review", input: validReview }] }]);
    const result = await runAgent("diff", provider, { maxSteps: 5, root: process.cwd() });
    expect(result.review.findings[0].message).toBe("m");
    expect(result.dropped).toBe(0);
  });

  it("normalizes a bad severity in the submitted payload", async () => {
    const bad = { findings: [{ ...validReview.findings[0], severity: "bug" }], commitMessage: "x" };
    const provider = scripted([{ toolCalls: [{ id: "s1", name: "submit_review", input: bad }] }]);
    const result = await runAgent("diff", provider, { maxSteps: 5, root: process.cwd() });
    expect(result.review.findings[0].severity).toBe("warning");
  });

  it("executes a tool then submits", async () => {
    const root = mkdtempSync(join(tmpdir(), "agent-"));
    const provider = scripted([
      { toolCalls: [{ id: "t1", name: "list_dir", input: { path: "." } }] },
      { toolCalls: [{ id: "s1", name: "submit_review", input: validReview }] },
    ]);
    const result = await runAgent("diff", provider, { maxSteps: 5, root });
    expect(result.review.findings).toHaveLength(1);
    rmSync(root, { recursive: true, force: true });
  });

  it("throws when no submit_review happens within maxSteps", async () => {
    const provider = scripted([
      { toolCalls: [{ id: "t1", name: "list_dir", input: { path: "." } }] },
      { toolCalls: [{ id: "t2", name: "list_dir", input: { path: "." } }] },
    ]);
    await expect(
      runAgent("diff", provider, { maxSteps: 2, root: process.cwd() }),
    ).rejects.toThrow(/did not submit/i);
  });
});
