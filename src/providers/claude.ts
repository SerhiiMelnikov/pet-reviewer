import Anthropic from "@anthropic-ai/sdk";
import { IReviewProvider } from "./types";

// Minimal client contract we need (makes testing easy).
interface IMessagesClient {
  messages: {
    create(body: unknown): Promise<{
      content: Array<{ type: string; text?: string }>;
    }>;
  };
}

export class ClaudeProvider implements IReviewProvider {
  private client: IMessagesClient;

  constructor(
    apiKey: string,
    readonly model = "claude-haiku-4-5-20251001",
    client?: IMessagesClient,
  ) {
    this.client = client ?? (new Anthropic({ apiKey }) as unknown as IMessagesClient);
  }

  async review(prompt: string): Promise<string> {
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });
    return msg.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
  }
}
