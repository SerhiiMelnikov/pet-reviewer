import { execFileSync } from "node:child_process";

export type TCommandRunner = (cmd: string, args: string[]) => string;

export const defaultRunner: TCommandRunner = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (err) {
    // stderr is captured (not leaked to the console); fold it into the error message
    // so callers that surface err.message keep their diagnostics on a real failure.
    const stderr = String((err as { stderr?: unknown }).stderr ?? "").trim();
    if (stderr) (err as Error).message = `${(err as Error).message}\n${stderr}`;
    throw err;
  }
};

// Returns the diff to review: working tree vs HEAD by default, or the three-dot
// `<base>...HEAD` (the PR diff — changes since the merge-base) when a base ref is given.
// `ignore` glob patterns become `:(exclude,glob)` pathspecs so git omits those files.
export function getDiff(
  run: TCommandRunner = defaultRunner,
  base?: string,
  ignore: string[] = [],
): string {
  const args = base ? ["diff", `${base}...HEAD`] : ["diff", "HEAD"];
  if (ignore.length > 0) {
    // Anchor with `.` so the pure-exclude pathspec list is valid across git versions.
    args.push("--", ".", ...ignore.map((pattern) => `:(exclude,glob)${pattern}`));
  }
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
