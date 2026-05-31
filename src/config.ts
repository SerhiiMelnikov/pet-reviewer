import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { TSeverity, TCategory, IRule, SEVERITIES, CATEGORIES } from "./schema";

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
    throw new Error(`${CONFIG_FILENAME} must export an object.`);
  }
  const config = raw as IReviewerConfig;

  if (config.provider !== undefined && config.provider !== "claude" && config.provider !== "ollama") {
    throw new Error(
      `Invalid "provider" in ${CONFIG_FILENAME}: "${config.provider}". Use "claude" or "ollama".`,
    );
  }

  const blockLevel = config.commit?.blockLevel;
  if (blockLevel !== undefined && !SEVERITIES.includes(blockLevel)) {
    throw new Error(
      `Invalid commit.blockLevel "${blockLevel}". Use one of: ${SEVERITIES.join(", ")}.`,
    );
  }

  const skip = config.commit?.skip;
  if (skip !== undefined) {
    if (!Array.isArray(skip)) {
      throw new Error(`commit.skip in ${CONFIG_FILENAME} must be an array.`);
    }
    for (const cat of skip) {
      if (!CATEGORIES.includes(cat as TCategory)) {
        throw new Error(
          `Invalid commit.skip category "${cat}". Use any of: ${CATEGORIES.join(", ")}.`,
        );
      }
    }
  }

  const rules = config.rules;
  if (rules !== undefined) {
    if (!Array.isArray(rules)) {
      throw new Error(`rules in ${CONFIG_FILENAME} must be an array.`);
    }
    rules.forEach((rule, i) => {
      if (rule === null || typeof rule !== "object" || typeof rule.text !== "string") {
        throw new Error(`rules[${i}] must be an object with a string "text".`);
      }
      if (rule.text.length > 500) {
        throw new Error(`rules[${i}].text exceeds the 500-character limit.`);
      }
      if (!SEVERITIES.includes(rule.severity)) {
        throw new Error(
          `Invalid rules[${i}].severity "${rule.severity}". Use one of: ${SEVERITIES.join(", ")}.`,
        );
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
    throw new Error(`Failed to load ${CONFIG_FILENAME}: ${(err as Error).message}`);
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
