import { IReviewProvider } from "./types";

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
    const res = await this.fetchFn(
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
      },
    );

    const data = (await res.json()) as IGeminiResponse;
    return data.candidates?.[0]?.content?.parts?.[0]?.text as string;
  }
}
