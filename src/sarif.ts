import { IReview, IFinding, TSeverity, TCategory, CATEGORIES } from "./schema";

// SARIF result.level for each of our severities.
const LEVEL_BY_SEVERITY: Record<TSeverity, "error" | "warning" | "note"> = {
  critical: "error",
  warning: "warning",
  nit: "note",
};

// Static rule catalog (tool.driver.rules) — one entry per finding category.
const RULE_DESCRIPTIONS: Record<TCategory, string> = {
  bug: "A logic error or defect that can cause incorrect behavior.",
  security: "A vulnerability or unsafe practice with security impact.",
  performance: "An inefficiency that affects speed or resource use.",
  readability: "Code that is harder to read or understand than necessary.",
  style: "A formatting or stylistic inconsistency.",
  custom: "A violation of a user-defined review rule.",
};

function toResult(finding: IFinding): Record<string, unknown> {
  const text =
    finding.suggestion !== null
      ? `${finding.message}\n\nSuggestion: ${finding.suggestion}`
      : finding.message;

  const physicalLocation: Record<string, unknown> = {
    artifactLocation: { uri: finding.file },
  };
  // A finding not tied to a line becomes a file-level result (no region).
  if (finding.line !== null) {
    physicalLocation.region = { startLine: finding.line };
  }

  return {
    ruleId: finding.category,
    level: LEVEL_BY_SEVERITY[finding.severity],
    message: { text },
    locations: [{ physicalLocation }],
  };
}

// Serialize a review as a SARIF 2.1.0 document (pretty-printed JSON string).
export function reviewToSarif(review: IReview): string {
  const sarif = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "pet-reviewer",
            informationUri: "https://github.com/SerhiiMelnikov/pet-reviewer",
            rules: CATEGORIES.map((category) => ({
              id: category,
              name: category,
              shortDescription: { text: RULE_DESCRIPTIONS[category] },
            })),
          },
        },
        results: review.findings.map(toResult),
      },
    ],
  };
  return JSON.stringify(sarif, null, 2);
}
