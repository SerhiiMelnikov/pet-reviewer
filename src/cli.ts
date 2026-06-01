import "dotenv/config";
import { Command } from "commander";
import pc from "picocolors";
import { getDiff } from "./git";
import { buildPrompt } from "./prompt";
import { parseReview } from "./parse";
import { renderFindings } from "./render";
import { getProvider } from "./providers";
import { decideCommit } from "./gate";
import { createCommit } from "./commit";
import { SEVERITIES, CATEGORIES, TSeverity, TCategory } from "./schema";
import { loadConfig, resolveSettings } from "./config";
import { initConfig } from "./init";
import { ERRORS } from "./errors";

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

// Maps the resolved API key to the env-var name the chosen provider expects.
export function providerEnv(
  provider: string,
  apiKey?: string,
): Record<string, string | undefined> {
  if (provider === "gemini") return { GEMINI_API_KEY: apiKey };
  return { ANTHROPIC_API_KEY: apiKey };
}

interface IReviewOpts {
  provider?: string;
  commit: boolean;
  blockLevel?: string;
  skip?: string;
  model?: string;
  baseUrl?: string;
}

async function runReview(opts: IReviewOpts): Promise<void> {
  let config;
  try {
    config = await loadConfig();
  } catch (err) {
    console.error(pc.red((err as Error).message));
    process.exit(1);
  }

  let cliBlockLevel: TSeverity | undefined;
  let cliSkip: TCategory[] | undefined;
  try {
    cliBlockLevel = opts.blockLevel ? parseBlockLevel(opts.blockLevel) : undefined;
    cliSkip = opts.skip ? parseSkip(opts.skip) : undefined;
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
    },
    config,
    process.env,
  );

  let diff: string;
  try {
    diff = getDiff();
  } catch {
    console.error(
      pc.red("Failed to read git diff. Is this a git repository with at least one commit?"),
    );
    process.exit(1);
  }

  if (diff.trim() === "") {
    console.log(pc.yellow("No changes to review (git diff is empty)."));
    return;
  }

  let provider;
  try {
    provider = getProvider(
      settings.provider,
      providerEnv(settings.provider, settings.apiKey),
      { model: settings.model, baseUrl: settings.baseUrl },
    );
  } catch (err) {
    console.error(pc.red((err as Error).message));
    process.exit(1);
  }

  console.log(pc.dim(`Analyzing changes via "${settings.provider}"...`));
  let rawText: string;
  try {
    rawText = await provider.review(buildPrompt(diff, settings.rules));
  } catch (err) {
    console.error(pc.red(`Model request failed: ${(err as Error).message}`));
    process.exit(1);
  }

  let review;
  try {
    review = parseReview(rawText);
  } catch (err) {
    console.error(pc.red(`Failed to parse the model response: ${(err as Error).message}`));
    process.exit(1);
  }
  console.log("\n" + renderFindings(review.findings));

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
    .action(runReview);

  await program.parseAsync();
}
