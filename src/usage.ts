import { IUsage } from "./providers/types";

// Field-wise sum of two usage records. cacheReadTokens is always present in the
// result (0 when neither input had it) to keep aggregation totals concrete.
export function addUsage(a: IUsage, b: IUsage): IUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: (a.cacheReadTokens ?? 0) + (b.cacheReadTokens ?? 0),
  };
}

// One-line human summary; routed through the caller's stderr-safe `diag` in JSON mode.
export function formatUsage(usage: IUsage, steps?: number): string {
  const fmt = (n: number) => n.toLocaleString("en-US");
  const parts = [`${fmt(usage.inputTokens)} in`, `${fmt(usage.outputTokens)} out`];
  if (usage.cacheReadTokens) parts.push(`${fmt(usage.cacheReadTokens)} cached`);
  let line = `Tokens: ${parts.join(" · ")}`;
  if (steps && steps > 1) line += `  (agent: ${steps} steps)`;
  return line;
}
