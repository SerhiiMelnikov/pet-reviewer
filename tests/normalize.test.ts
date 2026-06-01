import { describe, it, expect } from "vitest";
import { normalizeReview } from "../src/normalize";

const base = {
  findings: [
    { file: "a.ts", line: 1, severity: "nit", category: "style", message: "m", suggestion: null },
  ],
  commitMessage: "chore: x",
};

describe("normalizeReview", () => {
  it("returns null for a non-object", () => {
    expect(normalizeReview(null)).toBeNull();
    expect(normalizeReview("nope")).toBeNull();
  });

  it("returns null when findings is not an array", () => {
    expect(normalizeReview({ commitMessage: "x" })).toBeNull();
  });

  it("passes a clean review through unchanged with dropped 0", () => {
    const result = normalizeReview(base)!;
    expect(result.dropped).toBe(0);
    expect(result.review).toEqual(base);
  });

  it("coerces a category-like severity to the default warning", () => {
    const result = normalizeReview({
      findings: [{ ...base.findings[0], severity: "bug" }],
      commitMessage: "x",
    })!;
    expect(result.dropped).toBe(0);
    expect(result.review.findings[0].severity).toBe("warning");
  });

  it("recognizes severity synonyms", () => {
    const synonyms: Array<[string, string]> = [
      ["blocker", "critical"],
      ["warn", "warning"],
      ["minor", "nit"],
    ];
    for (const [input, expected] of synonyms) {
      const result = normalizeReview({
        findings: [{ ...base.findings[0], severity: input }],
        commitMessage: "x",
      })!;
      expect(result.review.findings[0].severity).toBe(expected);
    }
  });

  it("defaults an invalid category to bug", () => {
    const result = normalizeReview({
      findings: [{ ...base.findings[0], category: "quality" }],
      commitMessage: "x",
    })!;
    expect(result.review.findings[0].category).toBe("bug");
  });

  it("coerces a numeric-string line and nulls a bad one", () => {
    const r1 = normalizeReview({
      findings: [{ ...base.findings[0], line: "33" }],
      commitMessage: "x",
    })!;
    expect(r1.review.findings[0].line).toBe(33);

    const r2 = normalizeReview({
      findings: [{ ...base.findings[0], line: "nope" }],
      commitMessage: "x",
    })!;
    expect(r2.review.findings[0].line).toBeNull();
  });

  it("nulls a missing suggestion", () => {
    const { suggestion, ...noSuggestion } = base.findings[0];
    const result = normalizeReview({ findings: [noSuggestion], commitMessage: "x" })!;
    expect(result.review.findings[0].suggestion).toBeNull();
  });

  it("drops a finding missing file or message and counts it", () => {
    const result = normalizeReview({
      findings: [
        base.findings[0],
        { line: 2, severity: "nit", category: "style", message: "no file" },
        { file: "b.ts", line: 3, severity: "nit", category: "style" },
      ],
      commitMessage: "x",
    })!;
    expect(result.dropped).toBe(2);
    expect(result.review.findings).toHaveLength(1);
    expect(result.review.findings[0].file).toBe("a.ts");
  });

  it("defaults a missing commitMessage", () => {
    const result = normalizeReview({ findings: [] })!;
    expect(result.review.commitMessage).toBe("chore: apply reviewed changes");
  });
});
