import { readFileSync, existsSync, statSync } from "node:fs";
import { resolveInRoot } from "./sandbox";
import { IAgentTool } from "./index";

const READ_FILE_MAX_CHARS = 20000;

export const readFileTool: IAgentTool = {
  spec: {
    name: "read_file",
    description: "Read a UTF-8 text file from the repository, given a path relative to the repo root.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "File path relative to the repo root" } },
      required: ["path"],
    },
  },
  async execute(input, root) {
    const path = String(input.path ?? "");
    const target = resolveInRoot(root, path);
    if (!existsSync(target) || !statSync(target).isFile()) {
      throw new Error(`File not found: ${path}`);
    }
    const content = readFileSync(target, "utf8");
    if (content.length > READ_FILE_MAX_CHARS) {
      return `${content.slice(0, READ_FILE_MAX_CHARS)}\n... [truncated, ${content.length - READ_FILE_MAX_CHARS} more chars]`;
    }
    return content;
  },
};
