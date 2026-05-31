import { describe, it, expect } from "vitest";
import { decideCommit } from "../src/gate";
import { IFinding } from "../src/schema";

function finding(over: Partial<IFinding>): IFinding {
  return {
    file: "a.ts",
    line: 1,
    severity: "warning",
    category: "bug",
    message: "m",
    suggestion: null,
    ...over,
  };
}

describe("decideCommit", () => {
  it("returns no blockers for an empty findings list", () => {
    const r = decideCommit([], { blockLevel: "warning", skip: [] });
    expect(r.blockers).toEqual([]);
  });

  it("blocks findings at or above the threshold", () => {
    const findings = [finding({ severity: "warning" }), finding({ severity: "critical" })];
    const r = decideCommit(findings, { blockLevel: "warning", skip: [] });
    expect(r.blockers).toHaveLength(2);
  });

  it("lets findings below the threshold pass", () => {
    const r = decideCommit([finding({ severity: "nit" })], { blockLevel: "warning", skip: [] });
    expect(r.blockers).toEqual([]);
  });

  it("does not block skipped categories even above the threshold", () => {
    const r = decideCommit([finding({ severity: "critical", category: "style" })], {
      blockLevel: "warning",
      skip: ["style"],
    });
    expect(r.blockers).toEqual([]);
  });

  it("still blocks non-skipped categories", () => {
    const findings = [
      finding({ severity: "warning", category: "style" }),
      finding({ severity: "warning", category: "bug" }),
    ];
    const r = decideCommit(findings, { blockLevel: "warning", skip: ["style"] });
    expect(r.blockers).toHaveLength(1);
    expect(r.blockers[0].category).toBe("bug");
  });
});
