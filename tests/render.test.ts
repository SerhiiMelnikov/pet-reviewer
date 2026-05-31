import { describe, it, expect } from "vitest";
import { renderFindings } from "../src/render";
import { IFinding } from "../src/schema";

const finding: IFinding = {
  file: "src/app.ts",
  line: 10,
  severity: "critical",
  category: "bug",
  message: "Division by zero",
  suggestion: "Check the denominator",
};

describe("renderFindings", () => {
  it("reports when there are no findings", () => {
    const out = renderFindings([]);
    expect(out.toLowerCase()).toContain("clean");
  });

  it("shows the file, line, and message", () => {
    const out = renderFindings([finding]);
    expect(out).toContain("src/app.ts");
    expect(out).toContain("10");
    expect(out).toContain("Division by zero");
  });

  it("groups findings by file (file appears once as a header)", () => {
    const second: IFinding = { ...finding, line: 20, message: "Another one" };
    const out = renderFindings([finding, second]);
    const occurrences = out.split("src/app.ts").length - 1;
    expect(occurrences).toBe(1);
  });
});
