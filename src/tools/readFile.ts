import { readFileSync, existsSync, statSync } from "node:fs";
import { resolveInRoot } from "./sandbox";
import { IAgentTool } from "./index";

const READ_FILE_MAX_CHARS = 8000;

export const readFileTool: IAgentTool = {
  spec: {
    name: "read_file",
    description:
      "Read a UTF-8 text file from the repository (path relative to the repo root). Output is line-numbered. For large files, pass start_line/end_line to read just the relevant window instead of the whole file.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to the repo root" },
        start_line: { type: "number", description: "Optional 1-based first line to read (inclusive)" },
        end_line: { type: "number", description: "Optional 1-based last line to read (inclusive)" },
      },
      required: ["path"],
    },
  },
  async execute(input, root) {
    const path = String(input.path ?? "");
    const target = resolveInRoot(root, path);
    if (!existsSync(target) || !statSync(target).isFile()) {
      throw new Error(`File not found: ${path}`);
    }
    const lines = readFileSync(target, "utf8").split("\n");
    const total = lines.length;

    // Optional 1-based inclusive window; bad/missing values fall back to the whole file.
    const rawStart = Number(input.start_line);
    const rawEnd = Number(input.end_line);
    let start = Number.isFinite(rawStart) ? Math.trunc(rawStart) : 1;
    let end = Number.isFinite(rawEnd) ? Math.trunc(rawEnd) : total;
    if (start < 1) start = 1;
    if (end > total) end = total;
    if (start > total || start > end) {
      return `(file has ${total} lines; requested range ${start}-${end} is out of range)`;
    }

    const rendered = lines
      .slice(start - 1, end)
      .map((text, i) => `${start + i}: ${text}`)
      .join("\n");

    if (rendered.length > READ_FILE_MAX_CHARS) {
      return `${rendered.slice(0, READ_FILE_MAX_CHARS)}\n... [truncated, ${rendered.length - READ_FILE_MAX_CHARS} more chars]`;
    }
    return rendered;
  },
};
