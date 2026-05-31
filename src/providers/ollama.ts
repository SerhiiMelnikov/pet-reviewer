import { IReviewProvider } from "./types";

interface IOllamaResponse {
  response: string;
}

export class OllamaProvider implements IReviewProvider {
  constructor(
    readonly model = "llama3.2",
    readonly baseUrl = "http://localhost:11434",
    private fetchFn: typeof fetch = fetch,
    private timeoutMs = 180_000,
  ) {}

  async review(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          format: "json",
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        throw new Error(
          `Ollama request timed out after ${this.timeoutMs / 1000}s. The model may be loading or slow on this machine. Warm it up with \`ollama run ${this.model}\` or increase the timeout.`,
        );
      }
      throw new Error(
        `Could not connect to Ollama at ${this.baseUrl}. Is the server running (\`ollama serve\`)?`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw new Error(
        `Ollama returned an error ${res.status}. Is the model \`${this.model}\` pulled (\`ollama pull ${this.model}\`)?`,
      );
    }
    const data = (await res.json()) as IOllamaResponse;
    return data.response;
  }
}
