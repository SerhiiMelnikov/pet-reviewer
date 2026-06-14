import { describe, it, expect } from "vitest";
import { reviewToSarif } from "../src/sarif";
import { IReview, CATEGORIES } from "../src/schema";

function parse(review: IReview) {
  return JSON.parse(reviewToSarif(review));
}

describe("reviewToSarif", () => {
  it("produces a valid SARIF 2.1.0 envelope with the pet-reviewer driver", () => {
    const doc = parse({ findings: [], commitMessage: "" });
    expect(doc.$schema).toBe("https://json.schemastore.org/sarif-2.1.0.json");
    expect(doc.version).toBe("2.1.0");
    expect(doc.runs[0].tool.driver.name).toBe("pet-reviewer");
    expect(doc.runs[0].results).toEqual([]);
  });

  it("includes a rule catalog with one entry per category", () => {
    const rules = parse({ findings: [], commitMessage: "" }).runs[0].tool.driver.rules;
    expect(rules.map((r: { id: string }) => r.id)).toEqual([...CATEGORIES]);
    expect(rules[0]).toMatchObject({ id: "bug", name: "bug" });
    expect(typeof rules[0].shortDescription.text).toBe("string");
  });

  it("maps severity to SARIF level (critical→error, warning→warning, nit→note)", () => {
    const doc = parse({
      findings: [
        { file: "a.ts", line: 1, severity: "critical", category: "bug", message: "m", suggestion: null },
        { file: "b.ts", line: 2, severity: "warning", category: "style", message: "m", suggestion: null },
        { file: "c.ts", line: 3, severity: "nit", category: "readability", message: "m", suggestion: null },
      ],
      commitMessage: "",
    });
    expect(doc.runs[0].results.map((r: { level: string }) => r.level)).toEqual([
      "error",
      "warning",
      "note",
    ]);
  });

  it("sets ruleId to the finding category and maps the location", () => {
    const result = parse({
      findings: [
        { file: "src/x.ts", line: 42, severity: "warning", category: "security", message: "m", suggestion: null },
      ],
      commitMessage: "",
    }).runs[0].results[0];
    expect(result.ruleId).toBe("security");
    expect(result.locations[0].physicalLocation.artifactLocation.uri).toBe("src/x.ts");
    expect(result.locations[0].physicalLocation.region.startLine).toBe(42);
  });

  it("omits the region for a file-level (null line) finding", () => {
    const result = parse({
      findings: [
        { file: "src/x.ts", line: null, severity: "nit", category: "style", message: "m", suggestion: null },
      ],
      commitMessage: "",
    }).runs[0].results[0];
    expect(result.locations[0].physicalLocation.artifactLocation.uri).toBe("src/x.ts");
    expect(result.locations[0].physicalLocation.region).toBeUndefined();
  });

  it("appends the suggestion to the message text when present", () => {
    const withSug = parse({
      findings: [
        { file: "a.ts", line: 1, severity: "warning", category: "bug", message: "Bad thing", suggestion: "Do better" },
      ],
      commitMessage: "",
    }).runs[0].results[0];
    expect(withSug.message.text).toBe("Bad thing\n\nSuggestion: Do better");

    const noSug = parse({
      findings: [
        { file: "a.ts", line: 1, severity: "warning", category: "bug", message: "Bad thing", suggestion: null },
      ],
      commitMessage: "",
    }).runs[0].results[0];
    expect(noSug.message.text).toBe("Bad thing");
  });
});
