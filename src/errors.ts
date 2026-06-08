export enum EErrorCode {
  MissingApiKey = "1.1",
  UnknownProvider = "1.2",
  ProviderTimeout = "2.1",
  ProviderUnreachable = "2.2",
  ProviderHttp = "2.3",
  ProviderEmptyResponse = "2.4",
  ConfigNotObject = "3.1",
  ConfigProvider = "3.2",
  ConfigBlockLevel = "3.3",
  ConfigSkipNotArray = "3.4",
  ConfigSkipCategory = "3.5",
  ConfigRulesNotArray = "3.6",
  ConfigRuleShape = "3.7",
  ConfigRuleTextLength = "3.8",
  ConfigRuleSeverity = "3.9",
  ConfigLoadFailed = "3.10",
  ConfigTemperature = "3.11",
  ParseInvalidJson = "4.1",
  ParseSchemaMismatch = "4.2",
  InitConfigExists = "5.1",
  CliBlockLevel = "6.1",
  CliSkipCategory = "6.2",
  CliMaxSteps = "6.3",
  CliTemperature = "6.4",
  CliBaseCommit = "6.5",
  CliFailOn = "6.6",
  CliFailOnCommit = "6.7",
  AgentUnsupported = "7.1",
}

export class ReviewerError extends Error {
  constructor(readonly code: EErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = "ReviewerError";
  }
}

export const ERRORS = {
  // 1.x — provider config / factory
  missingApiKey: (envVar: string, configPath: string, keyUrl: string) =>
    new ReviewerError(
      EErrorCode.MissingApiKey,
      `${envVar} is not set. Set it in your environment (e.g. a .env file) or in reviewer.config.js (${configPath}). Get a key at ${keyUrl}`,
    ),
  unknownProvider: (name: string) =>
    new ReviewerError(
      EErrorCode.UnknownProvider,
      `Unknown provider: ${name}. Available: claude, ollama, gemini, openai-compatible`,
    ),

  // 2.x — provider runtime
  providerTimeout: (name: string, secs: number, hint = "Try again or increase the timeout.") =>
    new ReviewerError(
      EErrorCode.ProviderTimeout,
      `${name} request timed out after ${secs}s. ${hint}`,
    ),
  providerUnreachable: (name: string, baseUrl: string, hint: string) =>
    new ReviewerError(
      EErrorCode.ProviderUnreachable,
      `Could not reach ${name} at ${baseUrl}. ${hint}`,
    ),
  providerHttp: (name: string, status: number, hint: string) =>
    new ReviewerError(
      EErrorCode.ProviderHttp,
      `${name} returned an error ${status}. ${hint}`,
    ),
  providerEmptyResponse: (name: string) =>
    new ReviewerError(
      EErrorCode.ProviderEmptyResponse,
      `${name} returned no content. The response may have been blocked or empty.`,
    ),

  // 3.x — config validation
  configNotObject: (filename: string) =>
    new ReviewerError(EErrorCode.ConfigNotObject, `${filename} must export an object.`),
  configProvider: (filename: string, value: string) =>
    new ReviewerError(
      EErrorCode.ConfigProvider,
      `Invalid "provider" in ${filename}: "${value}". Use "claude", "ollama", "gemini", or "openai-compatible".`,
    ),
  configBlockLevel: (value: string, allowed: string) =>
    new ReviewerError(
      EErrorCode.ConfigBlockLevel,
      `Invalid commit.blockLevel "${value}". Use one of: ${allowed}.`,
    ),
  configSkipNotArray: (filename: string) =>
    new ReviewerError(EErrorCode.ConfigSkipNotArray, `commit.skip in ${filename} must be an array.`),
  configSkipCategory: (value: string, allowed: string) =>
    new ReviewerError(
      EErrorCode.ConfigSkipCategory,
      `Invalid commit.skip category "${value}". Use any of: ${allowed}.`,
    ),
  configRulesNotArray: (filename: string) =>
    new ReviewerError(EErrorCode.ConfigRulesNotArray, `rules in ${filename} must be an array.`),
  configRuleShape: (i: number) =>
    new ReviewerError(
      EErrorCode.ConfigRuleShape,
      `rules[${i}] must be an object with a string "text".`,
    ),
  configRuleTextLength: (i: number) =>
    new ReviewerError(
      EErrorCode.ConfigRuleTextLength,
      `rules[${i}].text exceeds the 500-character limit.`,
    ),
  configRuleSeverity: (i: number, value: string, allowed: string) =>
    new ReviewerError(
      EErrorCode.ConfigRuleSeverity,
      `Invalid rules[${i}].severity "${value}". Use one of: ${allowed}.`,
    ),
  configLoadFailed: (filename: string, detail: string) =>
    new ReviewerError(EErrorCode.ConfigLoadFailed, `Failed to load ${filename}: ${detail}`),
  configTemperature: (filename: string, value: string) =>
    new ReviewerError(
      EErrorCode.ConfigTemperature,
      `Invalid "temperature" in ${filename}: "${value}". Use a number between 0 and 1.`,
    ),

  // 4.x — parse / model output
  parseInvalidJson: (rawText: string) =>
    new ReviewerError(EErrorCode.ParseInvalidJson, `Model returned invalid JSON:\n${rawText}`),
  parseSchemaMismatch: (rawText: string) =>
    new ReviewerError(
      EErrorCode.ParseSchemaMismatch,
      `Model response does not match the review schema:\n${rawText}`,
    ),

  // 5.x — init
  initConfigExists: (filename: string) =>
    new ReviewerError(
      EErrorCode.InitConfigExists,
      `${filename} already exists. Use --force to overwrite.`,
    ),

  // 6.x — CLI flags
  cliBlockLevel: (value: string, allowed: string) =>
    new ReviewerError(EErrorCode.CliBlockLevel, `Invalid --block-level "${value}". Use one of: ${allowed}`),
  cliSkipCategory: (value: string, allowed: string) =>
    new ReviewerError(EErrorCode.CliSkipCategory, `Invalid --skip category "${value}". Use any of: ${allowed}`),
  cliMaxSteps: (value: string) =>
    new ReviewerError(EErrorCode.CliMaxSteps, `Invalid --max-steps "${value}". Use a positive integer.`),
  cliTemperature: (value: string) =>
    new ReviewerError(EErrorCode.CliTemperature, `Invalid --temperature "${value}". Use a number between 0 and 1.`),
  cliBaseCommit: () =>
    new ReviewerError(
      EErrorCode.CliBaseCommit,
      "--commit cannot be combined with --base: --base reviews committed branch changes, while --commit commits uncommitted working-tree changes.",
    ),
  cliFailOn: (value: string, allowed: string) =>
    new ReviewerError(EErrorCode.CliFailOn, `Invalid --fail-on "${value}". Use one of: ${allowed}.`),
  cliFailOnCommit: () =>
    new ReviewerError(
      EErrorCode.CliFailOnCommit,
      "--fail-on cannot be combined with --commit: --commit commits when nothing blocks, while --fail-on only sets a non-zero exit code (for CI) and never commits.",
    ),

  // 7.x — agent mode
  agentUnsupported: (provider: string) =>
    new ReviewerError(
      EErrorCode.AgentUnsupported,
      `Agent mode supports only the claude, gemini, and openai-compatible providers. Got "${provider}". Use --provider claude, gemini, or openai-compatible.`,
    ),
};
