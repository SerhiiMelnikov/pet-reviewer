import { IToolSpec } from "../providers/types";

export interface IAgentTool {
  spec: IToolSpec;
  execute(input: Record<string, unknown>, root: string): Promise<string>;
}
