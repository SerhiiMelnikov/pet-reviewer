import { IReviewProvider } from "./types";
import { ERRORS } from "../errors";

interface IGeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

export class GeminiProvider implements IReviewProvider {
  constructor(
    private apiKey: string,
    readonly model = "gemini-2.5-flash",
    readonly baseUrl = "https://generativelanguage.googleapis.com",
    private fetchFn: typeof fetch = fetch,
    private timeoutMs = 180_000,
  ) {}

  async review(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchFn(
        `${this.baseUrl}/v1beta/models/${this.model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
          signal: controller.signal,
        },
      );
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        throw ERRORS.providerTimeout("Gemini", this.timeoutMs / 1000);
      }
      throw ERRORS.providerUnreachable(
        "Gemini",
        this.baseUrl,
        "Check your internet connection.",
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw ERRORS.providerHttp(
        "Gemini",
        res.status,
        `Check your GEMINI_API_KEY and that the model \`${this.model}\` exists.`,
      );
    }

    const data = (await res.json()) as IGeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text === undefined) {
      throw ERRORS.providerEmptyResponse("Gemini");
    }
    return text;
  }
}
