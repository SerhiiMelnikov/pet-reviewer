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
      } catch {
        return "(no matches)";
      }
    },
  };
}
