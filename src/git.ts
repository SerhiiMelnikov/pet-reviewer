import { execFileSync } from "node:child_process";

export type TCommandRunner = (cmd: string, args: string[]) => string;

export const defaultRunner: TCommandRunner = (cmd, args) =>
  execFileSync(cmd, args, { encoding: "utf8" });

// Returns changes relative to the last commit (staged + unstaged).
export function getDiff(run: TCommandRunner = defaultRunner): string {
  return run("git", ["diff", "HEAD"]);
}

// Returns the repository root, falling back to the current directory.
export function getRepoRoot(run: TCommandRunner = defaultRunner): string {
  try {
    return run("git", ["rev-parse", "--show-toplevel"]).trim();
  } catch {
    return process.cwd();
  }
}
