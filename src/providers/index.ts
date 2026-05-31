import { IReviewProvider } from "./types";
import { OllamaProvider } from "./ollama";
import { ClaudeProvider } from "./claude";

export type TProviderName = "claude" | "ollama";

export interface IProviderOptions {
  model?: string;
  baseUrl?: string;
}

export function getProvider(
  name: string,
  env: Record<string, string | undefined> = process.env,
  options: IProviderOptions = {},
): IReviewProvider {
  const normalized = name.toLowerCase();
  if (normalized === "ollama") {
    return new OllamaProvider(options.model || undefined, options.baseUrl || undefined);
  }
  if (normalized === "claude") {
    const key = env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Set it in your environment (e.g. a .env file) or in reviewer.config.js (providers.claude.apiKey). Get a key at https://console.anthropic.com",
      );
    }
    return new ClaudeProvider(key, options.model || undefined);
  }
  throw new Error(`Unknown provider: ${name}. Available: claude, ollama`);
}
