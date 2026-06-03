import { execFileSync } from "node:child_process";

export type TCommandRunner = (cmd: string, args: string[]) => string;

export const defaultRunner: TCommandRunner = (cmd, args) =>
  execFileSync(cmd, args, { encoding: "utf8" });

// Returns the diff to review: working tree vs HEAD by default, or the three-dot
// `<base>...HEAD` (the PR diff — changes since the merge-base) when a base ref is given.
export function getDiff(run: TCommandRunner = defaultRunner, base?: string): string {
  const args = base ? ["diff", `${base}...HEAD`] : ["diff", "HEAD"];
  return run("git", args);
}

// Returns the repository root, falling back to the current directory.
export function getRepoRoot(run: TCommandRunner = defaultRunner): string {
  try {
    return run("git", ["rev-parse", "--show-toplevel"]).trim();
  } catch {
    return process.cwd();
  }
}
