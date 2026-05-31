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
  it("parses a valid review object", () => {
    expect(parseReview(JSON.stringify(review))).toEqual(review);
  });

  it("parses a review with no findings", () => {
    const empty = { findings: [], commitMessage: "feat: x" };
    expect(parseReview(JSON.stringify(empty))).toEqual(empty);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseReview("not json")).toThrow();
  });

  it("throws when commitMessage is missing", () => {
    expect(() => parseReview(JSON.stringify({ findings: [] }))).toThrow();
  });

  it("throws when a finding is malformed", () => {
    const bad = {
      findings: [{ ...review.findings[0], severity: "boom" }],
      commitMessage: "x",
    };
    expect(() => parseReview(JSON.stringify(bad))).toThrow();
  });
});
