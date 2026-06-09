import { describe, it, expect } from "vitest";
import { parseTimeout } from "../src/cli";

describe("parseTimeout", () => {
  it("returns undefined when unset", () => {
    expect(parseTimeout(undefined)).toBeUndefined();
  });
  it("parses a positive integer", () => {
    expect(parseTimeout("900")).toBe(900);
  });
  it("rejects zero, negatives, and non-integers", () => {
    expect(() => parseTimeout("0")).toThrow(/--timeout/);
    expect(() => parseTimeout("-1")).toThrow(/--timeout/);
    expect(() => parseTimeout("1.5")).toThrow(/--timeout/);
    expect(() => parseTimeout("abc")).toThrow(/--timeout/);
  });
});
