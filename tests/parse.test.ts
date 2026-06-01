import { describe, it, expect } from "vitest";
import { extractJson, parseReview } from "../src/parse";

const review = {
  findings: [
    { file: "a.ts", line: 1, severity: "nit", category: "style", message: "msg", suggestion: null },
  ],
  commitMessage: "chore: tweak a.ts",
};

describe("extractJson", () => {
  it("extracts the object from a fenced ```json block", () => {
    const rawText = 'Here:\n```json\n{"a":1}\n```\nthanks';
    expect(extractJson(rawText)).toBe('{"a":1}');
  });

  it("extracts the object from raw text with prose", () => {
    const rawText = 'blah {"a": 1} end';
    expect(extractJson(rawText)).toBe('{"a": 1}');
  });
});

describe("parseReview", () => {
  it("returns the review and dropped count for a valid object", () => {
    const result = parseReview(JSON.stringify(review));
    expect(result.review).toEqual(review);
    expect(result.dropped).toBe(0);
  });

  it("parses a review with no findings", () => {
    const empty = { findings: [], commitMessage: "feat: x" };
    expect(parseReview(JSON.stringify(empty)).review).toEqual(empty);
  });

  it("normalizes a finding whose severity is a category value", () => {
    const bad = {
      findings: [{ ...review.findings[0], severity: "bug" }],
      commitMessage: "x",
    };
    const result = parseReview(JSON.stringify(bad));
    expect(result.review.findings[0].severity).toBe("warning");
    expect(result.dropped).toBe(0);
  });

  it("drops an unrepairable finding and counts it", () => {
    const mixed = {
      findings: [review.findings[0], { line: 2, severity: "nit", category: "style" }],
      commitMessage: "x",
    };
    const result = parseReview(JSON.stringify(mixed));
    expect(result.review.findings).toHaveLength(1);
    expect(result.dropped).toBe(1);
  });

  it("defaults a missing commitMessage instead of throwing", () => {
    const result = parseReview(JSON.stringify({ findings: [] }));
    expect(result.review.commitMessage).toBe("chore: apply reviewed changes");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseReview("not json")).toThrow();
  });

  it("throws on a non-review object", () => {
    expect(() => parseReview(JSON.stringify({ notFindings: 1 }))).toThrow();
  });
});
