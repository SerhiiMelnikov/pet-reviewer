import { createColors } from "picocolors";

// Enable ANSI colors only on a real TTY (or when explicitly forced). picocolors'
// default also turns colors ON whenever a CI env var is present, which pollutes
// captured output (e.g. the CI review PR comment) with raw escape codes.
export function colorEnabled(
  env: NodeJS.ProcessEnv = process.env,
  isTTY: boolean = Boolean(process.stdout.isTTY),
): boolean {
  if (env.NO_COLOR) return false;
  if (env.FORCE_COLOR) return true;
  return isTTY;
}

export default createColors(colorEnabled());
