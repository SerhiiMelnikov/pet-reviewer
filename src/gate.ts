import { IFinding, TSeverity, TCategory } from "./schema";

const SEVERITY_RANK: Record<TSeverity, number> = {
  nit: 1,
  warning: 2,
  critical: 3,
};

export interface IGateOptions {
  blockLevel: TSeverity;
  skip: TCategory[];
}

export interface IGateResult {
  blockers: IFinding[];
}

// A finding blocks the commit when it is at or above the threshold severity
// AND its category is not in the skip list.
export function decideCommit(
  findings: IFinding[],
  options: IGateOptions,
): IGateResult {
  const threshold = SEVERITY_RANK[options.blockLevel];
  const blockers = findings.filter(
    (f) =>
      SEVERITY_RANK[f.severity] >= threshold &&
      !options.skip.includes(f.category),
  );
  return { blockers };
}
