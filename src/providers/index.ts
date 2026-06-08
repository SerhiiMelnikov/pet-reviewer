import { IReviewProvider, IAgentProvider } from "./types";
import { OllamaProvider } from "./ollama";
import { ClaudeProvider } from "./claude";
import { GeminiProvider } from "./gemini";
import { OpenAICompatibleProvider } from "./openai";
import { ERRORS } from "../errors";

export type TProviderName = "claude" | "ollama" | "gemini" | "openai-compatible";

export interface IProviderOptions {
  model?: string;
  baseUrl?: string;
  temperature?: number;
}

export function getProvider(
  name: string,
  env: Record<string, string | undefined> = process.env,
  options: IProviderOptions = {},
): IReviewProvider {
  const normalized = name.toLowerCase();
  if (normalized === "ollama") {
    return new OllamaProvider(options.model || undefined, options.baseUrl || undefined, options.temperature ?? 0);
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
    return new ClaudeProvider(key, options.model || undefined, options.temperature ?? 0);
  }
  if (normalized === "gemini") {
    const key = env.GEMINI_API_KEY;
    if (!key) {
      throw ERRORS.missingApiKey(
        "GEMINI_API_KEY",
        "providers.gemini.apiKey",
        "https://aistudio.google.com/apikey",
      );
    }
    return new GeminiProvider(key, options.model || undefined, options.baseUrl || undefined, options.temperature ?? 0);
  }
  if (normalized === "openai-compatible") {
    const key = env.OPENAI_API_KEY;
    if (!key) {
      throw ERRORS.missingApiKey(
        "OPENAI_API_KEY",
        'providers["openai-compatible"].apiKey',
        "https://platform.openai.com/api-keys",
      );
    }
    return new OpenAICompatibleProvider(
      key,
      options.model || undefined,
      options.baseUrl || undefined,
      options.temperature ?? 0,
    );
  }
  throw ERRORS.unknownProvider(name);
}

export function getAgentProvider(
  name: string,
  env: Record<string, string | undefined> = process.env,
  options: IProviderOptions = {},
): IAgentProvider {
  const normalized = name.toLowerCase();
  if (normalized === "claude") {
    const key = env.ANTHROPIC_API_KEY;
    if (!key) {
      throw ERRORS.missingApiKey(
        "ANTHROPIC_API_KEY",
        "providers.claude.apiKey",
        "https://console.anthropic.com",
      );
    }
    return new ClaudeProvider(key, options.model || undefined, options.temperature ?? 0);
  }
  if (normalized === "gemini") {
    const key = env.GEMINI_API_KEY;
    if (!key) {
      throw ERRORS.missingApiKey(
        "GEMINI_API_KEY",
        "providers.gemini.apiKey",
        "https://aistudio.google.com/apikey",
      );
    }
    return new GeminiProvider(key, options.model || undefined, options.baseUrl || undefined, options.temperature ?? 0);
  }
  if (normalized === "openai-compatible") {
    const key = env.OPENAI_API_KEY;
    if (!key) {
      throw ERRORS.missingApiKey(
        "OPENAI_API_KEY",
        'providers["openai-compatible"].apiKey',
        "https://platform.openai.com/api-keys",
      );
    }
    return new OpenAICompatibleProvider(
      key,
      options.model || undefined,
      options.baseUrl || undefined,
      options.temperature ?? 0,
    );
  }
  throw ERRORS.agentUnsupported(name);
}
