import { describe, it, expect } from "vitest";
import { addUsage, formatUsage } from "../src/usage";

describe("addUsage", () => {
  it("sums input and output tokens field-wise", () => {
    const total = addUsage(
      { inputTokens: 10, outputTokens: 2 },
      { inputTokens: 5, outputTokens: 3 },
    );
    expect(total).toEqual({ inputTokens: 15, outputTokens: 5, cacheReadTokens: 0 });
  });

  it("sums cacheReadTokens when present on either side", () => {
    const total = addUsage(
      { inputTokens: 1, outputTokens: 1, cacheReadTokens: 4 },
      { inputTokens: 1, outputTokens: 1 },
    );
    expect(total.cacheReadTokens).toBe(4);
  });
});

describe("formatUsage", () => {
  it("renders input/output with grouping", () => {
    expect(formatUsage({ inputTokens: 3200, outputTokens: 540 })).toBe(
      "Tokens: 3,200 in · 540 out",
    );
  });

  it("includes cached tokens when non-zero", () => {
    expect(
      formatUsage({ inputTokens: 100, outputTokens: 10, cacheReadTokens: 1100 }),
    ).toContain("1,100 cached");
  });

  it("appends the agent step count when steps > 1", () => {
    expect(formatUsage({ inputTokens: 1, outputTokens: 1 }, 4)).toContain("(agent: 4 steps)");
  });

  it("omits the step suffix for a single step", () => {
    expect(formatUsage({ inputTokens: 1, outputTokens: 1 }, 1)).not.toContain("agent:");
  });
});
