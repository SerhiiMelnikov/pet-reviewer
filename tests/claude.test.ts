import { describe, it, expect, vi } from "vitest";
import { ClaudeProvider } from "../src/providers/claude";

describe("ClaudeProvider", () => {
  it("sends the prompt and joins text from response blocks", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        { type: "text", text: "[" },
        { type: "text", text: "]" },
      ],
    });
    const fakeClient = { messages: { create } };
    const provider = new ClaudeProvider("key", "claude-haiku-4-5-20251001", fakeClient);

    const result = await provider.review("MY_PROMPT");

    expect(result).toBe("[]");
    const body = create.mock.calls[0][0];
    expect(body.model).toBe("claude-haiku-4-5-20251001");
    expect(body.messages[0].content).toBe("MY_PROMPT");
  });
});
