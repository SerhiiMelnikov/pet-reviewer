import { IAgentProvider, IMessage, IAgentTurn, TContentBlock, IUsage } from "./providers/types";
import { AGENT_TOOLS, ALL_TOOL_SPECS, SUBMIT_REVIEW_SPEC } from "./tools/index";
import { normalizeReview, INormalizeResult } from "./normalize";
import { buildAgentPrompt } from "./prompt";
import { IRule } from "./schema";
import { addUsage } from "./usage";

export interface IAgentOptions {
  maxSteps: number;
  root: string;
}

// Rebuild the assistant message from a turn (text block + any tool_use blocks).
function appendAssistant(messages: IMessage[], turn: IAgentTurn): void {
  const assistantBlocks: TContentBlock[] = [];
  if (turn.text) assistantBlocks.push({ type: "text", text: turn.text });
  for (const tc of turn.toolCalls) {
    assistantBlocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input, signature: tc.signature });
  }
  messages.push({
    role: "assistant",
    content: assistantBlocks.length ? assistantBlocks : (turn.text ?? ""),
  });
}

// Run every tool call in a turn. Returns the tool_result blocks to feed back, and
// the final review (set only when a valid submit_review is seen).
async function processToolCalls(
  turn: IAgentTurn,
  root: string,
): Promise<{ resultBlocks: TContentBlock[]; finalResult: INormalizeResult | null }> {
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
      const out = await tool.execute(tc.input, root);
      resultBlocks.push({ type: "tool_result", toolCallId: tc.id, content: out });
    } catch (err) {
      resultBlocks.push({ type: "tool_result", toolCallId: tc.id, content: (err as Error).message, isError: true });
    }
  }

  return { resultBlocks, finalResult };
}

export async function runAgent(
  diff: string,
  provider: IAgentProvider,
  options: IAgentOptions,
  rules: IRule[] = [],
): Promise<INormalizeResult> {
  const messages: IMessage[] = [{ role: "user", content: buildAgentPrompt(diff, rules) }];
  let usage: IUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
  let steps = 0;

  for (let step = 0; step < options.maxSteps; step++) {
    const turn = await provider.chat(messages, ALL_TOOL_SPECS);
    steps++;
    if (turn.usage) usage = addUsage(usage, turn.usage);
    appendAssistant(messages, turn);

    if (turn.toolCalls.length === 0) {
      messages.push({
        role: "user",
        content: "Use the read-only tools to gather context, then call submit_review.",
      });
      continue;
    }

    const { resultBlocks, finalResult } = await processToolCalls(turn, options.root);
    messages.push({ role: "user", content: resultBlocks });
    if (finalResult) return { ...finalResult, usage, steps };
  }

  // Steps exhausted with no submit. One forced finalization call — tools limited to
  // submit_review only — to salvage whatever the model found, flagged as truncated.
  messages.push({
    role: "user",
    content:
      "You have run out of steps. Do not call any more read-only tools. Call submit_review now with the findings you have gathered so far. A partial review is fine.",
  });
  const finalTurn = await provider.chat(messages, [SUBMIT_REVIEW_SPEC], { forceTool: "submit_review" });
  steps++;
  if (finalTurn.usage) usage = addUsage(usage, finalTurn.usage);
  appendAssistant(messages, finalTurn);
  const { finalResult } = await processToolCalls(finalTurn, options.root);
  if (finalResult) return { ...finalResult, truncated: true, usage, steps };

  // Even the forced submit produced nothing usable — return an empty review rather
  // than crash, so step exhaustion never leaves the user with nothing. A distinct
  // commit message keeps git history honest if this is committed with --commit.
  return {
    review: { findings: [], commitMessage: "chore: incomplete agent review" },
    dropped: 0,
    truncated: true,
    usage,
    steps,
  };
}
