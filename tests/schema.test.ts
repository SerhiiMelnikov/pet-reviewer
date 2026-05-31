import { describe, it, expect } from "vitest";
import { isFinding, isReview } from "../src/schema";

const valid = {
  file: "src/app.ts",
  line: 42,
  severity: "warning",
  category: "bug",
  message: "Possible null",
  suggestion: "Add a check",
};

describe("isFinding", () => {
  it("accepts a valid finding", () => {
    expect(isFinding(valid)).toBe(true);
  });

  it("accepts line=null and suggestion=null", () => {
    expect(isFinding({ ...valid, line: null, suggestion: null })).toBe(true);
  });

  it("rejects an unknown severity", () => {
    expect(isFinding({ ...valid, severity: "blocker" })).toBe(false);
  });

  it("rejects an unknown category", () => {
    expect(isFinding({ ...valid, category: "typo" })).toBe(false);
  });

  it("rejects a missing message field", () => {
    const { message, ...withoutMessage } = valid;
    expect(isFinding(withoutMessage)).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isFinding(null)).toBe(false);
    expect(isFinding("some string")).toBe(false);
  });

  it("accepts the custom category", () => {
    expect(isFinding({ ...valid, category: "custom" })).toBe(true);
  });
});

const validReview = {
  findings: [valid],
  commitMessage: "chore: tweak app",
};

describe("isReview", () => {
  it("accepts a valid review object", () => {
    expect(isReview(validReview)).toBe(true);
  });

  it("accepts a review with no findings", () => {
    expect(isReview({ findings: [], commitMessage: "feat: x" })).toBe(true);
  });

  it("rejects a missing commitMessage", () => {
    expect(isReview({ findings: [] })).toBe(false);
  });

  it("rejects findings that is not an array", () => {
    expect(isReview({ findings: "nope", commitMessage: "x" })).toBe(false);
  });

  it("rejects a malformed finding", () => {
    expect(
      isReview({ findings: [{ ...valid, severity: "boom" }], commitMessage: "x" }),
    ).toBe(false);
  });
});
