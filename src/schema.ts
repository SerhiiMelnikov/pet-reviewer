export type TSeverity = "critical" | "warning" | "nit";
export type TCategory =
  | "bug"
  | "security"
  | "performance"
  | "readability"
  | "style"
  | "custom";

export interface IFinding {
  file: string;
  line: number | null;
  severity: TSeverity;
  category: TCategory;
  message: string;
  suggestion: string | null;
}

export const SEVERITIES: TSeverity[] = ["critical", "warning", "nit"];
export const CATEGORIES: TCategory[] = [
  "bug",
  "security",
  "performance",
  "readability",
  "style",
  "custom",
];

export function isFinding(value: unknown): value is IFinding {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  if (typeof o.file !== "string") return false;
  if (!(o.line === null || typeof o.line === "number")) return false;
  if (!SEVERITIES.includes(o.severity as TSeverity)) return false;
  if (!CATEGORIES.includes(o.category as TCategory)) return false;
  if (typeof o.message !== "string") return false;
  if (!(o.suggestion === null || typeof o.suggestion === "string")) return false;
  return true;
}

export interface IReview {
  findings: IFinding[];
  commitMessage: string;
}

export function isReview(value: unknown): value is IReview {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  if (!Array.isArray(o.findings)) return false;
  if (!o.findings.every(isFinding)) return false;
  if (typeof o.commitMessage !== "string") return false;
  return true;
}

export interface IRule {
  text: string;
  severity: TSeverity;
}
