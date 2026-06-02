import { IAgentProvider, IMessage, TContentBlock } from "./providers/types";
import { AGENT_TOOLS, ALL_TOOL_SPECS } from "./tools/index";
import { normalizeReview, INormalizeResult } from "./normalize";
import { buildAgentPrompt } from "./prompt";
import { ERRORS } from "./errors";
import { IRule } from "./schema";

export interface IAgentOptions {
  maxSteps: number;
  root: string;
}

export async function runAgent(
  diff: string,
  provider: IAgentProvider,
  options: IAgentOptions,
  rules: IRule[] = [],
): Promise<INormalizeResult> {
  const messages: IMessage[] = [{ role: "user", content: buildAgentPrompt(diff, rules) }];

  for (let step = 0; step < options.maxSteps; step++) {
    const turn = await provider.chat(messages, ALL_TOOL_SPECS);

    const assistantBlocks: TContentBlock[] = [];
    if (turn.text) assistantBlocks.push({ type: "text", text: turn.text });
    for (const tc of turn.toolCalls) {
      assistantBlocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
    }
    messages.push({
      role: "assistant",
      content: assistantBlocks.length ? assistantBlocks : (turn.text ?? ""),
    });

    if (turn.toolCalls.length === 0) {
      messages.push({
        role: "user",
        content: "Use the read-only tools to gather context, then call submit_review.",
      });
      continue;
    }

    const resultBlocks: TContentBlock[] = [];
    let finalResult: INormalizeResult | null = null;

    for (const tc of turn.toolCalls) {
      if (tc.name === "submit_review") {
        const normalized = normalizeReview(tc.input);
        if (normalized) {
          finalResult = normalized;
          resultBlocks.push({ type: "tool_result", toolCallId: tc.id, content: "Review submitted." });
        } else {
          resultBlocks.push({
            type: "tool_result",
            toolCallId: tc.id,
            content: "Invalid submit_review payload: expected { findings: [...], commitMessage: string }.",
            isError: true,
          });
        }
        continue;
      }
      const tool = AGENT_TOOLS.find((t) => t.spec.name === tc.name);
      if (!tool) {
        resultBlocks.push({ type: "tool_result", toolCallId: tc.id, content: `Unknown tool: ${tc.name}`, isError: true });
        continue;
      }
      try {
        const out = await tool.execute(tc.input, options.root);
        resultBlocks.push({ type: "tool_result", toolCallId: tc.id, content: out });
      } catch (err) {
        resultBlocks.push({ type: "tool_result", toolCallId: tc.id, content: (err as Error).message, isError: true });
      }
    }

    messages.push({ role: "user", content: resultBlocks });
    if (finalResult) return finalResult;
  }

  throw ERRORS.agentNoSubmit(options.maxSteps);
}
