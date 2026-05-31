import { TCommandRunner, defaultRunner } from "./git";

// Stages every change and commits it with the given message.
export function createCommit(
  message: string,
  run: TCommandRunner = defaultRunner,
): void {
  run("git", ["add", "-A"]);
  run("git", ["commit", "-m", message]);
}
