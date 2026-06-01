import { IReviewProvider } from "./types";
import { OllamaProvider } from "./ollama";
import { ClaudeProvider } from "./claude";
import { ERRORS } from "../errors";

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
      throw ERRORS.missingApiKey(
        "ANTHROPIC_API_KEY",
        "providers.claude.apiKey",
        "https://console.anthropic.com",
      );
    }
    return new ClaudeProvider(key, options.model || undefined);
  }
  throw ERRORS.unknownProvider(name);
}
