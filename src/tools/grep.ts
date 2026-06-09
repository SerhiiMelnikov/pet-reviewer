import { TCommandRunner, defaultRunner } from "../git";
import { IAgentTool } from "./index";

export function makeGrepTool(run: TCommandRunner = defaultRunner): IAgentTool {
  return {
    spec: {
      name: "grep",
      description: "Search the repository for a regex pattern (uses git grep -E, extended regex, over tracked files).",
      inputSchema: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Extended regular expression pattern to search for (git grep -E)" },
          path: { type: "string", description: "Optional path to limit the search" },
        },
        required: ["pattern"],
      },
    },
    async execute(input, root) {
      const pattern = String(input.pattern ?? "");
      const args = ["-C", root, "grep", "-n", "-E", "-e", pattern];
      if (input.path) args.push("--", String(input.path));
      try {
        const out = run("git", args);
        return out.trim() === "" ? "(no matches)" : out;
      } catch (err) {
        const e = err as { status?: number; stderr?: unknown; message?: unknown };
        // status 1 means "no matches"; anything else (including an undefined status
        // from an unexpected failure) is a real error to surface to the model.
        if (e.status === 1) return "(no matches)";
        // Prefer captured stderr; fall back to the error message for plain Errors.
        const detail = String(e.stderr ?? "").trim() || String(e.message ?? "").trim();
        const firstLine = detail.split(/\r?\n/).find((line) => line.trim() !== "") ?? "git grep failed";
        return `(grep error: ${firstLine})`;
      }
    },
  };
}
