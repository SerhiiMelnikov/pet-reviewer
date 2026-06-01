import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { TSeverity, TCategory, IRule, SEVERITIES, CATEGORIES } from "./schema";
import { ERRORS } from "./errors";

export const CONFIG_FILENAME = "reviewer.config.js";
export const DEFAULT_PROVIDER = "claude";
export const DEFAULT_BLOCK_LEVEL: TSeverity = "warning";

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
  };
  commit?: {
    blockLevel?: TSeverity;
    skip?: TCategory[];
  };
  rules?: IRule[];
}

export interface IResolvedSettings {
  provider: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  blockLevel: TSeverity;
  skip: TCategory[];
  rules: IRule[];
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
    config.provider !== "gemini"
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
}

export function resolveSettings(
  cli: ICliFlags,
  config: IReviewerConfig,
  env: Record<string, string | undefined>,
): IResolvedSettings {
  const provider = cli.provider ?? config.provider ?? DEFAULT_PROVIDER;
  const providerConf =
    provider === "ollama" ? config.providers?.ollama : config.providers?.claude;

  return {
    provider,
    model: cli.model ?? providerConf?.model,
    baseUrl: cli.baseUrl ?? providerConf?.baseUrl,
    apiKey: config.providers?.claude?.apiKey ?? env.ANTHROPIC_API_KEY,
    blockLevel: cli.blockLevel ?? config.commit?.blockLevel ?? DEFAULT_BLOCK_LEVEL,
    skip: cli.skip ?? config.commit?.skip ?? [],
    rules: config.rules ?? [],
  };
}
