import { IToolSpec } from "../providers/types";

export interface IAgentTool {
  spec: IToolSpec;
  execute(input: Record<string, unknown>, root: string): Promise<string>;
}

import { readFileTool } from "./readFile";
import { makeGrepTool } from "./grep";
import { listDirTool } from "./listDir";

export const AGENT_TOOLS: IAgentTool[] = [readFileTool, makeGrepTool(), listDirTool];

export const SUBMIT_REVIEW_SPEC: IToolSpec = {
  name: "submit_review",
  description: "Submit the final review. Call this once you have gathered enough context.",
  inputSchema: {
    type: "object",
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            file: { type: "string" },
            line: { type: ["number", "null"] },
            severity: { type: "string", enum: ["critical", "warning", "nit"] },
            category: {
              type: "string",
              enum: ["bug", "security", "performance", "readability", "style", "custom"],
            },
            message: { type: "string" },
            suggestion: { type: ["string", "null"] },
          },
          required: ["file", "severity", "category", "message"],
        },
      },
      commitMessage: { type: "string" },
    },
    required: ["findings", "commitMessage"],
  },
};

export const ALL_TOOL_SPECS: IToolSpec[] = [
  ...AGENT_TOOLS.map((t) => t.spec),
  SUBMIT_REVIEW_SPEC,
];
