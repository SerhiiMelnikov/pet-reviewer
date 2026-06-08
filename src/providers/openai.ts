import { IReviewProvider } from "./types";
import { ERRORS } from "../errors";

interface IOpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface IOpenAIResponse {
  choices?: Array<{
    message?: { content?: string | null; tool_calls?: IOpenAIToolCall[] };
  }>;
}

export class OpenAICompatibleProvider implements IReviewProvider {
  constructor(
    private apiKey: string,
    readonly model = "gpt-4o-mini",
    readonly baseUrl = "https://api.openai.com/v1",
    readonly temperature = 0,
    private fetchFn: typeof fetch = fetch,
    private timeoutMs = 180_000,
  ) {}

  // Shared transport: POST a request body to /chat/completions, map errors,
  // return the parsed response. Used by both review() and chat().
  private async request(body: unknown): Promise<IOpenAIResponse> {
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
        body: JSON.stringify(body),
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

    return (await res.json()) as IOpenAIResponse;
  }

  async review(prompt: string): Promise<string> {
    const data = await this.request({
      model: this.model,
      temperature: this.temperature,
      messages: [{ role: "user", content: prompt }],
    });
    const content = data.choices?.[0]?.message?.content;
    if (content === undefined || content === null) {
      throw ERRORS.providerEmptyResponse("OpenAI");
    }
    return content;
  }
}
