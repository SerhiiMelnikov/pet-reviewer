import { IReviewProvider } from "./types";

interface IOpenAIResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export class OpenAICompatibleProvider implements IReviewProvider {
  constructor(
    private apiKey: string,
    readonly model = "gpt-4o-mini",
    readonly baseUrl = "https://api.openai.com/v1",
    private fetchFn: typeof fetch = fetch,
    private timeoutMs = 180_000,
  ) {}

  async review(prompt: string): Promise<string> {
    const res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = (await res.json()) as IOpenAIResponse;
    return data.choices?.[0]?.message?.content as string;
  }
}
