import { readdirSync, existsSync, statSync } from "node:fs";
import { resolveInRoot } from "./sandbox";
import { IAgentTool } from "./index";

export const listDirTool: IAgentTool = {
  spec: {
    name: "list_dir",
    description: "List files and folders in a repository directory (path relative to the repo root).",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Directory path relative to the repo root" } },
    },
  },
  async execute(input, root) {
    const path = input.path ? String(input.path) : ".";
    const target = resolveInRoot(root, path);
    if (!existsSync(target) || !statSync(target).isDirectory()) {
      throw new Error(`Directory not found: ${path}`);
    }
    const entries = readdirSync(target, { withFileTypes: true })
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .sort();
    return entries.length ? entries.join("\n") : "(empty)";
  },
};
