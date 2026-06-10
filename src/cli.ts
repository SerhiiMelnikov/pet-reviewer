import "dotenv/config";
import { Command } from "commander";
import pc from "./colors";
import { getDiff, getRepoRoot } from "./git";
import { buildPrompt } from "./prompt";
import { parseReview } from "./parse";
import { renderFindings } from "./render";
import { getProvider, getAgentProvider } from "./providers";
import { runAgent } from "./agent";
import { INormalizeResult } from "./normalize";
import { decideCommit } from "./gate";
import { createCommit } from "./commit";
import { SEVERITIES, CATEGORIES, TSeverity, TCategory, IReview } from "./schema";
import { loadConfig, resolveSettings } from "./config";
import { initConfig } from "./init";
import { ERRORS } from "./errors";
import { IUsage } from "./providers/types";

function parseBlockLevel(value: string): TSeverity {
  if ((SEVERITIES as string[]).includes(value)) return value as TSeverity;
  throw ERRORS.cliBlockLevel(value, SEVERITIES.join(", "));
}

function parseSkip(value: string): TCategory[] {
  const items = value.split(",").map((s) => s.trim()).filter(Boolean);
  for (const item of items) {
    if (!(CATEGORIES as string[]).includes(item)) {
      throw ERRORS.cliSkipCategory(item, CATEGORIES.join(", "));
    }
  }
  return items as TCategory[];
}

function parseMaxSteps(value?: string): number {
  if (value === undefined) return 12;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw ERRORS.cliMaxSteps(value);
  }
  return n;
}

function parseTemperature(value?: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (Number.isNaN(n) || n < 0 || n > 1) {
    throw ERRORS.cliTemperature(value);
  }
  return n;
}

export function parseTimeout(value?: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (Number.isNaN(n) || !Number.isInteger(n) || n < 1) {
    throw ERRORS.cliTimeout(value);
  }
  return n;
}

export function reviewToJson(review: IReview): string {
  return JSON.stringify(review, null, 2);
}

function parseFailOn(value?: string): TSeverity | undefined {
  if (value === undefined) return undefined;
  if ((SEVERITIES as string[]).includes(value)) return value as TSeverity;
  throw ERRORS.cliFailOn(value, SEVERITIES.join(", "));
}

// Maps the resolved API key to the env-var name the chosen provider expects.
const PROVIDER_ENV_VAR: Record<string, string> = {
  gemini: "GEMINI_API_KEY",
  "openai-compatible": "OPENAI_API_KEY",
};

export function providerEnv(
  provider: string,
  apiKey?: string,
): Record<string, string | undefined> {
  return { [PROVIDER_ENV_VAR[provider] ?? "ANTHROPIC_API_KEY"]: apiKey };
}

interface IReviewOpts {
  provider?: string;
  commit: boolean;
  blockLevel?: string;
  skip?: string;
  model?: string;
  baseUrl?: string;
  agent?: boolean;
  maxSteps?: string;
  temperature?: string;
  timeout?: string;
  base?: string;
  failOn?: string;
  json?: boolean;
}

async function runReview(opts: IReviewOpts): Promise<void> {
  const diag = opts.json ? console.error : console.log;

  let config;
  try {
    config = await loadConfig();
  } catch (err) {
    console.error(pc.red((err as Error).message));
    process.exit(1);
  }

  let cliBlockLevel: TSeverity | undefined;
  let cliSkip: TCategory[] | undefined;
  let cliTemperature: number | undefined;
  let cliTimeoutSecs: number | undefined;
  let cliFailOn: TSeverity | undefined;
  try {
    cliBlockLevel = opts.blockLevel ? parseBlockLevel(opts.blockLevel) : undefined;
    cliSkip = opts.skip ? parseSkip(opts.skip) : undefined;
    cliTemperature = parseTemperature(opts.temperature);
    cliTimeoutSecs = parseTimeout(opts.timeout);
    cliFailOn = parseFailOn(opts.failOn);
    if (opts.base && opts.commit) {
      throw ERRORS.cliBaseCommit();
    }
    if (opts.commit && opts.failOn) {
      throw ERRORS.cliFailOnCommit();
    }
    if (opts.json && opts.commit) {
      throw ERRORS.cliJsonCommit();
    }
  } catch (err) {
    console.error(pc.red((err as Error).message));
    process.exit(1);
  }

  const settings = resolveSettings(
    {
      provider: opts.provider,
      model: opts.model,
      baseUrl: opts.baseUrl,
      blockLevel: cliBlockLevel,
      skip: cliSkip,
      temperature: cliTemperature,
      timeout: cliTimeoutSecs,
    },
    config,
    process.env,
  );

  let diff: string;
  try {
    diff = getDiff(undefined, opts.base, settings.ignore);
  } catch {
    const hint = opts.base
      ? `Could not diff against "${opts.base}". Make sure the ref exists (in CI, fetch it — e.g. actions/checkout with fetch-depth: 0).`
      : "Is this a git repository with at least one commit?";
    console.error(pc.red(`Failed to read git diff. ${hint}`));
    process.exit(1);
  }

  if (diff.trim() === "") {
    if (opts.json) console.log(reviewToJson({ findings: [], commitMessage: "" }));
    else console.log(pc.yellow("No changes to review (git diff is empty)."));
    return;
  }

  let result: INormalizeResult;

  if (opts.agent) {
    let maxSteps: number;
    let agentProvider;
    try {
      maxSteps = parseMaxSteps(opts.maxSteps);
      agentProvider = getAgentProvider(
        settings.provider,
        providerEnv(settings.provider, settings.apiKey),
        {
          model: settings.model,
          baseUrl: settings.baseUrl,
          temperature: settings.temperature,
          timeoutMs: settings.timeout !== undefined ? settings.timeout * 1000 : undefined,
        },
      );
    } catch (err) {
      console.error(pc.red((err as Error).message));
      process.exit(1);
    }
    diag(pc.dim(`Reviewing with the ${settings.provider} agent (max ${maxSteps} steps)...`));
    try {
      result = await runAgent(diff, agentProvider, { maxSteps, root: getRepoRoot() }, settings.rules);
    } catch (err) {
      console.error(pc.red(`Agent failed: ${(err as Error).message}`));
      process.exit(1);
    }
    if (result.truncated) {
      console.error(
        pc.yellow(`⚠ Agent ran out of steps (${maxSteps}); this review may be incomplete.`),
      );
    }
  } else {
    let provider;
    try {
      provider = getProvider(
        settings.provider,
        providerEnv(settings.provider, settings.apiKey),
        {
          model: settings.model,
          baseUrl: settings.baseUrl,
          temperature: settings.temperature,
          timeoutMs: settings.timeout !== undefined ? settings.timeout * 1000 : undefined,
        },
      );
    } catch (err) {
      console.error(pc.red((err as Error).message));
      process.exit(1);
    }
    diag(pc.dim(`Analyzing changes via "${settings.provider}"...`));
    let rawText: string;
    let singleShotUsage: IUsage | undefined;
    try {
      const reviewResult = await provider.review(buildPrompt(diff, settings.rules));
      rawText = reviewResult.text;
      singleShotUsage = reviewResult.usage;
    } catch (err) {
      console.error(pc.red(`Model request failed: ${(err as Error).message}`));
      process.exit(1);
    }
    try {
      result = parseReview(rawText);
    } catch (err) {
      console.error(pc.red(`Failed to parse the model response: ${(err as Error).message}`));
      process.exit(1);
    }
  }

  const { review, dropped } = result;
  if (dropped > 0) {
    console.error(
      pc.yellow(`Note: dropped ${dropped} malformed finding(s) from the model response.`),
    );
  }
  if (opts.json) {
    console.log(reviewToJson(review));
  } else {
    console.log("\n" + renderFindings(review.findings));
  }

  if (opts.commit) {
    const { blockers } = decideCommit(review.findings, {
      blockLevel: settings.blockLevel,
      skip: settings.skip,
    });
    if (blockers.length > 0) {
      console.error(
        pc.red(`\nCommit blocked by ${blockers.length} issue(s) at or above "${settings.blockLevel}".`),
      );
      process.exit(1);
    }
    try {
      createCommit(review.commitMessage);
    } catch (err) {
      console.error(pc.red(`Commit failed: ${(err as Error).message}`));
      process.exit(1);
    }
    console.log(pc.green(`\n✓ Committed: ${review.commitMessage}`));
  } else if (cliFailOn) {
    const { blockers } = decideCommit(review.findings, {
      blockLevel: cliFailOn,
      skip: settings.skip,
    });
    if (blockers.length > 0) {
      console.error(pc.red(`\n✗ ${blockers.length} finding(s) at or above "${cliFailOn}".`));
      process.exit(1);
    }
  }
}

export async function run(): Promise<void> {
  const program = new Command();
  program.name("pet-reviewer").description("AI review of your git diff");

  program
    .command("init")
    .description("create a starter reviewer.config.js")
    .option("-f, --force", "overwrite an existing config", false)
    .action((opts: { force: boolean }) => {
      try {
        const path = initConfig(process.cwd(), opts.force);
        console.log(pc.green(`✓ Created ${path}`));
      } catch (err) {
        console.error(pc.red((err as Error).message));
        process.exit(1);
      }
    });

  program
    .command("review", { isDefault: true })
    .description("review the current git diff (and commit with --commit)")
    .option("-p, --provider <name>", "engine: claude | ollama")
    .option("-c, --commit", "create a commit if there are no blocking issues", false)
    .option("--block-level <level>", "severity that blocks the commit: critical | warning | nit")
    .option("--skip <categories>", "comma-separated categories that never block")
    .option("--model <name>", "model to use")
    .option("--base-url <url>", "Ollama server URL")
    .option("--agent", "run an agentic review (Claude only): reads files, greps, lists dirs")
    .option("--max-steps <n>", "max agent tool-use steps (default 12)")
    .option("--temperature <n>", "sampling temperature 0..1 (default 0, deterministic)")
    .option("--timeout <seconds>", "per-request timeout in seconds (default 180; raise for slow local models)")
    .option("--base <ref>", "review committed changes vs this base ref (git diff <ref>...HEAD)")
    .option("--fail-on <level>", "exit non-zero if any finding is at/above this severity (CI gate, no commit)")
    .option("--json", "output the review as JSON to stdout (machine-readable; cannot be combined with --commit)")
    .action(runReview);

  await program.parseAsync();
}
