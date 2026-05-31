import pc from "picocolors";
import { IFinding, TSeverity } from "./schema";

const SEVERITY_ICON: Record<TSeverity, string> = {
  critical: "🔴",
  warning: "🟡",
  nit: "🔵",
};

function colorBySeverity(severity: TSeverity, text: string): string {
  if (severity === "critical") return pc.red(text);
  if (severity === "warning") return pc.yellow(text);
  return pc.blue(text);
}

export function renderFindings(findings: IFinding[]): string {
  if (findings.length === 0) {
    return pc.green("✓ No issues found — clean!");
  }

  const byFile = new Map<string, IFinding[]>();
  for (const f of findings) {
    const list = byFile.get(f.file) ?? [];
    list.push(f);
    byFile.set(f.file, list);
  }

  const lines: string[] = [];
  for (const [file, list] of byFile) {
    lines.push(pc.bold(pc.underline(file)));
    for (const f of list) {
      const where = f.line === null ? "—" : `line ${f.line}`;
      const head = `  ${SEVERITY_ICON[f.severity]} [${f.category}] ${where}`;
      lines.push(colorBySeverity(f.severity, head));
      lines.push(`     ${f.message}`);
      if (f.suggestion) {
        lines.push(pc.dim(`     ↳ ${f.suggestion}`));
      }
    }
    lines.push("");
  }

  lines.push(pc.bold(`Total findings: ${findings.length}`));
  return lines.join("\n");
}
