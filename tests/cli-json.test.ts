import { describe, it, expect } from "vitest";
import { reviewToJson } from "../src/cli";

describe("reviewToJson", () => {
  it("serializes a review into parseable JSON with findings and commitMessage", () => {
    const review = {
      findings: [
        { file: "a.ts", line: 3, severity: "warning", category: "bug", message: "m", suggestion: null },
      ],
      commitMessage: "fix: x",
    };
    const out = reviewToJson(review as any);
    const parsed = JSON.parse(out);
    expect(parsed.commitMessage).toBe("fix: x");
    expect(parsed.findings[0]).toMatchObject({ file: "a.ts", line: 3, message: "m" });
  });
});
