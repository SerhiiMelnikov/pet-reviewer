import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { TSeverity, TCategory, IRule, SEVERITIES, CATEGORIES } from "./schema";
import { ERRORS } from "./errors";

export const CONFIG_FILENAME = "reviewer.config.js";
export const DEFAULT_PROVIDER = "claude";
export const DEFAULT_BLOCK_LEVEL: TSeverity = "warning";
export const DEFAULT_IGNORE: string[] = [
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "dist/**",
  "build/**",
  "*.min.js",
  "*.snap",
  "__snapshots__/**",
];

export interface IProviderConfig {
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface IReviewerConfig {
  provider?: string;
  providers?: {
    claude?: IProviderConfig;
    ollama?: IProviderConfig;
    gemini?: IProviderConfig;
    "openai-compatible"?: IProviderConfig;
  };
  commit?: {
    blockLevel?: TSeverity;
    skip?: TCategory[];
  };
  rules?: IRule[];
  temperature?: number;
  timeout?: number;
  ignore?: string[];
  ignoreDefaults?: boolean;
}

export interface IResolvedSettings {
  provider: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  blockLevel: TSeverity;
  skip: TCategory[];
  rules: IRule[];
  temperature: number;
  timeout?: number;
  ignore: string[];
}

export function validateConfig(raw: unknown): IReviewerConfig {
  if (raw === null || typeof raw !== "object") {
    throw ERRORS.configNotObject(CONFIG_FILENAME);
  }
  const config = raw as IReviewerConfig;

  if (
    config.provider !== undefined &&
    config.provider !== "claude" &&
    config.provider !== "ollama" &&
    config.provider !== "gemini" &&
    config.provider !== "openai-compatible"
  ) {
    throw ERRORS.configProvider(CONFIG_FILENAME, String(config.provider));
  }

  const blockLevel = config.commit?.blockLevel;
  if (blockLevel !== undefined && !SEVERITIES.includes(blockLevel)) {
    throw ERRORS.configBlockLevel(String(blockLevel), SEVERITIES.join(", "));
  }

  const skip = config.commit?.skip;
  if (skip !== undefined) {
    if (!Array.isArray(skip)) {
      throw ERRORS.configSkipNotArray(CONFIG_FILENAME);
    }
    for (const cat of skip) {
      if (!CATEGORIES.includes(cat as TCategory)) {
        throw ERRORS.configSkipCategory(String(cat), CATEGORIES.join(", "));
      }
    }
  }

  const rules = config.rules;
  if (rules !== undefined) {
    if (!Array.isArray(rules)) {
      throw ERRORS.configRulesNotArray(CONFIG_FILENAME);
    }
    rules.forEach((rule, i) => {
      if (rule === null || typeof rule !== "object" || typeof rule.text !== "string") {
        throw ERRORS.configRuleShape(i);
      }
      if (rule.text.length > 500) {
        throw ERRORS.configRuleTextLength(i);
      }
      if (!SEVERITIES.includes(rule.severity)) {
        throw ERRORS.configRuleSeverity(i, String(rule.severity), SEVERITIES.join(", "));
      }
    });
  }

  const temperature = config.temperature;
  if (
    temperature !== undefined &&
    (typeof temperature !== "number" || Number.isNaN(temperature) || temperature < 0 || temperature > 1)
  ) {
    throw ERRORS.configTemperature(CONFIG_FILENAME, String(temperature));
  }

  const timeout = config.timeout;
  if (
    timeout !== undefined &&
    (typeof timeout !== "number" || !Number.isInteger(timeout) || timeout < 1)
  ) {
    throw ERRORS.configTimeout(CONFIG_FILENAME, String(timeout));
  }

  const ignore = config.ignore;
  if (ignore !== undefined) {
    if (!Array.isArray(ignore) || ignore.some((p) => typeof p !== "string")) {
      throw ERRORS.configIgnoreNotArray(CONFIG_FILENAME);
    }
  }

  if (config.ignoreDefaults !== undefined && typeof config.ignoreDefaults !== "boolean") {
    throw ERRORS.configIgnoreDefaults(CONFIG_FILENAME);
  }

  return config;
}

export async function loadConfig(
  cwd: string = process.cwd(),
): Promise<IReviewerConfig> {
  const path = join(cwd, CONFIG_FILENAME);
  if (!existsSync(path)) {
    return {};
  }
  let mod: { default?: unknown };
  try {
    mod = await import(pathToFileURL(path).href);
  } catch (err) {
    throw ERRORS.configLoadFailed(CONFIG_FILENAME, (err as Error).message);
  }
  return validateConfig(mod.default ?? mod);
}

export interface ICliFlags {
  provider?: string;
  model?: string;
  baseUrl?: string;
  blockLevel?: TSeverity;
  skip?: TCategory[];
  temperature?: number;
  timeout?: number;
}

export function resolveSettings(
  cli: ICliFlags,
  config: IReviewerConfig,
  env: Record<string, string | undefined>,
): IResolvedSettings {
  const provider = cli.provider ?? config.provider ?? DEFAULT_PROVIDER;

  const providerConf =
    provider === "ollama"
      ? config.providers?.ollama
      : provider === "gemini"
        ? config.providers?.gemini
        : provider === "openai-compatible"
          ? config.providers?.["openai-compatible"]
          : config.providers?.claude;

  let apiKey: string | undefined;
  if (provider === "claude") {
    apiKey = config.providers?.claude?.apiKey ?? env.ANTHROPIC_API_KEY;
  } else if (provider === "gemini") {
    apiKey = config.providers?.gemini?.apiKey ?? env.GEMINI_API_KEY;
  } else if (provider === "openai-compatible") {
    apiKey = config.providers?.["openai-compatible"]?.apiKey ?? env.OPENAI_API_KEY;
  }

  return {
    provider,
    model: cli.model ?? providerConf?.model,
    baseUrl: cli.baseUrl ?? providerConf?.baseUrl,
    apiKey,
    blockLevel: cli.blockLevel ?? config.commit?.blockLevel ?? DEFAULT_BLOCK_LEVEL,
    skip: cli.skip ?? config.commit?.skip ?? [],
    rules: config.rules ?? [],
    temperature: cli.temperature ?? config.temperature ?? 0,
    timeout: cli.timeout ?? config.timeout,
    ignore: (config.ignoreDefaults === false ? [] : DEFAULT_IGNORE).concat(config.ignore ?? []),
  };
}
