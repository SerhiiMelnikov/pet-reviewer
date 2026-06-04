import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgent } from "../src/agent";
import { IAgentProvider, IAgentTurn, IChatOptions, IMessage, TContentBlock } from "../src/providers/types";

function scripted(turns: IAgentTurn[]): IAgentProvider {
  let i = 0;
  return { async chat() { return turns[i++] ?? { toolCalls: [] }; } };
}

function recording(turns: IAgentTurn[]): {
  provider: IAgentProvider;
  calls: string[][];
  opts: (IChatOptions | undefined)[];
} {
  const calls: string[][] = [];
  const opts: (IChatOptions | undefined)[] = [];
  let i = 0;
  const provider: IAgentProvider = {
    async chat(_messages, tools, o) {
      calls.push(tools.map((t) => t.name));
      opts.push(o);
      return turns[i++] ?? { toolCalls: [] };
    },
  };
  return { provider, calls, opts };
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

  it("returns an empty truncated review when no submit happens within maxSteps", async () => {
    const provider = scripted([
      { toolCalls: [{ id: "t1", name: "list_dir", input: { path: "." } }] },
      { toolCalls: [{ id: "t2", name: "list_dir", input: { path: "." } }] },
    ]);
    const result = await runAgent("diff", provider, { maxSteps: 2, root: process.cwd() });
    expect(result.truncated).toBe(true);
    expect(result.review.findings).toEqual([]);
  });
});

describe("runAgent signature", () => {
  it("carries a tool-call signature into the assistant message", async () => {
    const seen: IMessage[][] = [];
    let i = 0;
    const turns: IAgentTurn[] = [
      { toolCalls: [{ id: "list_dir__0", name: "list_dir", input: { path: "." }, signature: "SIG" }] },
      { toolCalls: [{ id: "s1", name: "submit_review", input: validReview }] },
    ];
    const provider: IAgentProvider = {
      async chat(messages) {
        seen.push([...messages]);
        return turns[i++] ?? { toolCalls: [] };
      },
    };

    await runAgent("diff", provider, { maxSteps: 5, root: process.cwd() });

    const secondCall = seen[1];
    const assistant = secondCall.find((m) => m.role === "assistant")!;
    const block = (assistant.content as TContentBlock[]).find((b) => b.type === "tool_use")!;
    expect((block as { signature?: string }).signature).toBe("SIG");
  });
});

describe("runAgent forced finalization", () => {
  it("salvages a partial review via a forced submit when steps run out", async () => {
    const { provider, calls, opts } = recording([
      { toolCalls: [{ id: "t1", name: "list_dir", input: { path: "." } }] },
      { toolCalls: [{ id: "s1", name: "submit_review", input: validReview }] },
    ]);
    const result = await runAgent("diff", provider, { maxSteps: 1, root: process.cwd() });

    expect(result.truncated).toBe(true);
    expect(result.review.findings).toHaveLength(1);
    expect(calls[calls.length - 1]).toEqual(["submit_review"]);
    expect(opts[opts.length - 1]).toEqual({ forceTool: "submit_review" });
  });

  it("returns an empty truncated review when even the forced submit yields nothing", async () => {
    const provider = scripted([
      { toolCalls: [{ id: "t1", name: "list_dir", input: { path: "." } }] },
    ]);
    const result = await runAgent("diff", provider, { maxSteps: 1, root: process.cwd() });

    expect(result.truncated).toBe(true);
    expect(result.review.findings).toEqual([]);
    expect(result.review.commitMessage).toBe("chore: incomplete agent review");
  });
});
