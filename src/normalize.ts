import { IFinding, IReview, TSeverity, TCategory, CATEGORIES } from "./schema";

export interface INormalizeResult {
  review: IReview;
  dropped: number;
}

const SEVERITY_SYNONYMS: Record<string, TSeverity> = {
  critical: "critical",
  blocker: "critical",
  high: "critical",
  error: "critical",
  warning: "warning",
  warn: "warning",
  major: "warning",
  medium: "warning",
  nit: "nit",
  info: "nit",
  minor: "nit",
  low: "nit",
  trivial: "nit",
};

function normalizeSeverity(value: unknown): TSeverity {
  if (typeof value === "string") {
    const key = value.trim().toLowerCase();
    if (SEVERITY_SYNONYMS[key]) return SEVERITY_SYNONYMS[key];
  }
  return "warning";
}

function normalizeCategory(value: unknown): TCategory {
  if (typeof value === "string") {
    const key = value.trim().toLowerCase();
    if ((CATEGORIES as string[]).includes(key)) return key as TCategory;
  }
  return "bug";
}

function normalizeFinding(value: unknown): IFinding | null {
  if (typeof value !== "object" || value === null) return null;
  const o = value as Record<string, unknown>;

  if (typeof o.file !== "string" || o.file === "") return null;
  if (typeof o.message !== "string" || o.message === "") return null;

  let line: number | null = null;
  if (typeof o.line === "number") {
    line = o.line;
  } else if (
    typeof o.line === "string" &&
    o.line.trim() !== "" &&
    !Number.isNaN(Number(o.line))
  ) {
    line = Number(o.line);
  }

  return {
    file: o.file,
    line,
    severity: normalizeSeverity(o.severity),
    category: normalizeCategory(o.category),
    message: o.message,
    suggestion: typeof o.suggestion === "string" ? o.suggestion : null,
  };
}

export function normalizeReview(raw: unknown): INormalizeResult | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.findings)) return null;

  const commitMessage =
    typeof o.commitMessage === "string" && o.commitMessage !== ""
      ? o.commitMessage
      : "chore: apply reviewed changes";

  let dropped = 0;
  const findings: IFinding[] = [];
  for (const f of o.findings) {
    const normalized = normalizeFinding(f);
    if (normalized === null) dropped++;
    else findings.push(normalized);
  }

  return { review: { findings, commitMessage }, dropped };
}
