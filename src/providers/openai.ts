import { IReviewProvider } from "./types";
import { ERRORS } from "../errors";

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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        throw ERRORS.providerTimeout("OpenAI", this.timeoutMs / 1000);
      }
      throw ERRORS.providerUnreachable(
        "OpenAI",
        this.baseUrl,
        "Check your internet connection.",
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw ERRORS.providerHttp(
        "OpenAI",
        res.status,
        `Check your OPENAI_API_KEY, the baseUrl, and that the model \`${this.model}\` exists.`,
      );
    }

    const data = (await res.json()) as IOpenAIResponse;
    const content = data.choices?.[0]?.message?.content;
    if (content === undefined) {
      throw ERRORS.providerEmptyResponse("OpenAI");
    }
    return content;
  }
}
