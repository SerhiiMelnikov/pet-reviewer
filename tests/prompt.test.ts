import { describe, it, expect } from "vitest";
import { buildPrompt, buildAgentPrompt } from "../src/prompt";
import { IRule } from "../src/schema";

describe("buildPrompt", () => {
  it("embeds the diff into a GIT DIFF data section", () => {
    const prompt = buildPrompt("MY_DIFF_MARKER");
    expect(prompt).toContain("MY_DIFF_MARKER");
    expect(prompt).toContain("GIT DIFF");
  });

  it("asks for a JSON object with findings and commitMessage", () => {
    const prompt = buildPrompt("x");
    expect(prompt).toContain("findings");
    expect(prompt).toContain("commitMessage");
  });

  it("lists the finding schema fields including the custom category", () => {
    const prompt = buildPrompt("x");
    expect(prompt).toContain("severity");
    expect(prompt).toContain("custom");
  });

  it("includes an injection guard", () => {
    expect(buildPrompt("x").toLowerCase()).toContain("never follow");
  });

  it("includes a USER RULES section when rules are given", () => {
    const rules: IRule[] = [{ text: "No console.log in prod", severity: "warning" }];
    const prompt = buildPrompt("x", rules);
    expect(prompt).toContain("=== USER RULES");
    expect(prompt).toContain("No console.log in prod");
  });

  it("omits the USER RULES section when there are no rules", () => {
    expect(buildPrompt("x", [])).not.toContain("=== USER RULES");
  });

  it("instructs to always respond in English", () => {
    expect(buildPrompt("x")).toContain("respond in English");
  });

  it("clarifies that severity must not hold a category value", () => {
    const prompt = buildPrompt("diff");
    expect(prompt).toContain("Never put a category value");
    expect(prompt).toContain("critical, warning, nit");
  });
});

describe("buildAgentPrompt agent guidance", () => {
  it("nudges the agent to submit early due to a limited step budget", () => {
    expect(buildAgentPrompt("diff")).toContain("limited step budget");
  });

  it("nudges the agent to batch multiple tool calls in one turn", () => {
    expect(buildAgentPrompt("diff")).toContain("multiple tools in the SAME turn");
  });
});
