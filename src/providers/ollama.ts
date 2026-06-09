import { IReviewProvider } from "./types";
import { ERRORS } from "../errors";

interface IOllamaResponse {
  response: string;
}

export class OllamaProvider implements IReviewProvider {
  constructor(
    readonly model = "llama3.2",
    readonly baseUrl = "http://localhost:11434",
    readonly temperature = 0,
    private fetchFn: typeof fetch = fetch,
    private timeoutMs = 180_000,
  ) {}

  // Shared transport: POST a body to an Ollama endpoint, map errors with Ollama-specific
  // hints, return the parsed JSON. Used by both review() (/api/generate) and chat() (/api/chat).
  private async request(path: string, body: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        throw ERRORS.providerTimeout(
          "Ollama",
          this.timeoutMs / 1000,
          `Warm it up with \`ollama run ${this.model}\` or increase the timeout.`,
        );
      }
      throw ERRORS.providerUnreachable(
        "Ollama",
        this.baseUrl,
        "Is the server running (`ollama serve`)?",
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw ERRORS.providerHttp(
        "Ollama",
        res.status,
        `Is the model \`${this.model}\` pulled (\`ollama pull ${this.model}\`)?`,
      );
    }

    return res.json();
  }

  async review(prompt: string): Promise<string> {
    const data = (await this.request("/api/generate", {
      model: this.model,
      prompt,
      stream: false,
      format: "json",
      options: { temperature: this.temperature },
    })) as IOllamaResponse;
    return data.response;
  }
}
