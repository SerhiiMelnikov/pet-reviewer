# pet-reviewer

AI code reviewer for your terminal. It reads your `git diff`, asks an LLM (Claude,
Gemini, a local Ollama model, or any OpenAI-compatible API) to review it, prints
structured findings grouped by file, and can block a commit — or fail CI — when
something serious turns up.

## Quickstart (60 seconds)

```bash
npm install -D pet-reviewer            # add it to your project
export ANTHROPIC_API_KEY=sk-ant-...    # or GEMINI_API_KEY / OPENAI_API_KEY — see Providers
npx pet-reviewer init                  # write a starter reviewer.config.js
# ...make some code changes...
npx pet-reviewer                       # review your uncommitted changes
```

`init` scaffolds a `reviewer.config.js` you can edit; the bare `pet-reviewer` command
reviews `git diff HEAD` (staged + unstaged) and prints findings. Add `--commit` to also
create a commit when nothing blocks. Ollama needs no key (it runs locally).

## Example output

```text
$ npx pet-reviewer

src/auth.ts
  🔴 [security] line 42
     Password compared with == allows type juggling; use a constant-time compare.
     ↳ Replace `if (input == stored)` with `crypto.timingSafeEqual(...)`.
  🟡 [bug] line 88
     `findUser` may return undefined; the caller dereferences it without a guard.
     ↳ Add `if (!user) return null;` before using `user.id`.

src/utils.ts
  🔵 [style] —
     Comment above `parseDate` is not in English.
     ↳ Translate it to English.

Total findings: 3
```

Each finding shows a **severity** icon (🔴 critical, 🟡 warning, 🔵 nit), the
**category** in brackets, and the `file` + `line` (`—` when not tied to a line). The
next line states the problem; the dimmed `↳` line is a suggested fix. Findings are
grouped by file with a total at the end. No issues → `✓ No issues found — clean!`.

### Token usage

After every run, a one-line token report shows what the call cost:

```text
Tokens: 3,200 in · 540 out · 1,100 cached  (agent: 4 steps)
```

`in`/`out` are prompt and completion tokens; `cached` appears when the provider
served part of the prompt from cache (Claude prompt caching, Gemini implicit caching);
the `(agent: N steps)` suffix appears only in `--agent` mode and sums usage across every
step. With `--json`, the same numbers are embedded as a `usage` field in the output
object instead of being printed.

## How it works

```
git diff  ──►  build prompt  ──►  LLM (your provider)
                                      │
                              structured JSON findings
                                      │
   gate  ◄──────  render  ◄──────  parse & normalize
   (--commit / --fail-on)
```

1. Collect the diff: `git diff HEAD` (uncommitted), or `git diff <base>...HEAD` with
   `--base` (a branch's changes, the PR diff).
2. Build a prompt and send it to your chosen provider.
3. The model returns structured findings (file, line, severity, category, message,
   suggestion).
4. The response is schema-validated — malformed findings are repaired or dropped, so a
   broken reply never crashes the run or slips past the gate.
5. Findings are printed. Optionally a gate runs: `--commit` commits when nothing blocks,
   `--fail-on` exits non-zero for CI.

**Single-shot (default)** makes one model call on the diff — fast and cheap.
**Agent mode (`--agent`)** runs a tool-use loop where the model reads files, greps, and
lists directories to gather context beyond the diff before submitting — deeper and more
cross-file, but slower and costlier. See [Agent mode](#agent-mode).

## Usage

By default the reviewer reads `git diff HEAD` (staged + unstaged changes).

```bash
npx pet-reviewer                       # review uncommitted changes
npx pet-reviewer --commit              # review, then commit if nothing blocks
npx pet-reviewer --provider gemini     # use a different provider
npx pet-reviewer --agent               # agentic review (Claude, Gemini, or OpenAI-compatible)
npx pet-reviewer --base origin/main --fail-on warning   # CI: review a branch, fail on findings
```

| Flag | Purpose |
|------|---------|
| `--provider <name>` | `claude` \| `gemini` \| `openai-compatible` \| `ollama` |
| `--model <name>` | model id (overrides config / default) |
| `--base-url <url>` | endpoint (Ollama or an OpenAI-compatible service) |
| `--commit` | commit if nothing blocks |
| `--block-level <critical\|warning\|nit>` | severity that blocks `--commit` |
| `--skip <categories>` | comma-separated categories that never block |
| `--agent` | agentic review (reads files, greps, lists dirs) |
| `--max-steps <n>` | max agent tool-use steps (default 12) |
| `--timeout <seconds>` | per-request timeout in seconds (default 180; raise for slow local models) |
| `--temperature <0..1>` | sampling temperature (default 0, deterministic) |
| `--base <ref>` | review `git diff <ref>...HEAD` (a branch's committed changes) |
| `--fail-on <level>` | exit non-zero if any finding is at/above this severity (CI gate) |
| `--json` | output the review as JSON to stdout (machine-readable; not with `--commit`) |

`npx pet-reviewer init` scaffolds a `reviewer.config.js` — see [Configuration](#configuration).

## Providers & models

| Provider | Runs | API key (env var) | Default model | Pick another with |
|----------|------|-------------------|---------------|-------------------|
| claude | cloud (Anthropic) | `ANTHROPIC_API_KEY` | `claude-haiku-4-5-20251001` | `--model` or config |
| gemini | cloud (Google) | `GEMINI_API_KEY` | `gemini-2.5-flash` | `--model` or config |
| openai-compatible | cloud (OpenAI & compatible) | `OPENAI_API_KEY` | `gpt-4o-mini` | `--model` or config |
| ollama | local machine | none | `llama3.2` | `--model` or config |

Example models: Claude — `claude-haiku-4-5-20251001`, `claude-sonnet-4-6`.
Gemini — `gemini-2.5-flash`, `gemini-2.5-pro`. Ollama — any model you have
pulled, e.g. `llama3.2`, `qwen2.5-coder`.

### Tested models

These models are verified to work (review + agent unless noted):

| Provider | Verified models |
|----------|-----------------|
| Claude   | `opus` 4.0–4.8 · `sonnet` 4.0 / 4.5 / 4.6 · `haiku` 4.5 |
| Gemini   | `gemini-2.5-flash` · `-flash-lite` · `gemini-3-flash` · `gemini-3.1-flash-lite` · `gemini-3.5-flash` · `gemma-4` (review only) |

> Using a model that isn't listed, or one that doesn't work for you?
> [Open an issue](https://github.com/SerhiiMelnikov/pet-reviewer/issues).

Gemini and Claude run in the cloud — you only need an API key, nothing to
install. Ollama runs locally; install it and `ollama pull <model>` first. Get a
Gemini key at https://aistudio.google.com/apikey (generous free tier) and a Claude key
at https://console.anthropic.com.

`openai-compatible` speaks the OpenAI `/chat/completions` format, so one provider
covers many services — point `baseUrl` at the one you want and set `apiKey` to
its key:

- OpenAI — `https://api.openai.com/v1`
- OpenRouter — `https://openrouter.ai/api/v1`
- Groq — `https://api.groq.com/openai/v1`
- Together — `https://api.together.xyz/v1`
- DeepSeek — `https://api.deepseek.com/v1`
- LM Studio (local) — `http://localhost:1234/v1`

## Agent mode

By default the reviewer makes a single model call on your diff. With `--agent` it
runs an **agentic loop** instead: the model uses read-only tools to gather context
beyond the diff, then submits its findings.

```bash
npx pet-reviewer --agent
npx pet-reviewer --agent --provider gemini
npx pet-reviewer --agent --commit
npx pet-reviewer --agent --max-steps 20
```

- **Providers:** Claude (the default) and Gemini fully support agent mode.
  `openai-compatible` also works with `--agent` (**experimental** — verified against
  Groq and Fireworks; any OpenAI-compatible endpoint with tool-calling should work).
  `ollama` also works with `--agent` (**experimental** — needs a tool-capable local model
  such as `llama3.2` or `qwen2.5`).
- **Model choice matters:** the loop makes several sequential calls with growing
  context, so a weak model can be slow — you may wait a long time for a result.
  Prefer a stronger model for `--agent` (e.g. `claude-sonnet-4-6` or
  `gemini-2.5-pro`); the default `flash`/`haiku` models are fine for quick runs.
- **What it can do:** read any file in the repo (`read_file`), search the codebase
  (`grep`), and browse directories (`list_dir`). It is strictly read-only — it
  cannot write, run commands, or access anything outside the repository.
- **How it works:** the model thinks → calls a tool → reads the result → repeats,
  then calls `submit_review` to finish. The loop is bounded by `--max-steps`
  (default 12).
- **Trade-off:** deeper, cross-file reviews, but slower and costlier (several
  model calls per run) and less deterministic. Use the default single-shot mode
  for quick, cheap reviews; use `--agent` when depth matters.
- **Out of steps:** if the agent hits `--max-steps` before finishing, it returns a
  partial review (marked incomplete) instead of failing. Raise `--max-steps` for a
  fuller pass on large diffs.

## Severity levels

Every finding has one of three severities:

| Severity | Meaning |
|----------|---------|
| `critical` | Must fix — bugs, security holes, data loss. |
| `warning` | Should fix — likely problems or bad practice. |
| `nit` | Minor — style, naming, optional polish. |

Severities drive the gate. With `--commit`, a finding **blocks** the commit when its
severity is at or above `commit.blockLevel`; with `--fail-on <level>`, the process exits
non-zero when a finding is at or above `<level>` (rank order: `nit` < `warning` <
`critical`). Categories listed in `commit.skip` never block, even at `critical`.

## Configuration

`reviewer.config.js` (ESM `export default`; use `module.exports` in a CommonJS
project):

```js
export default {
  // Default provider: "claude" | "ollama" | "gemini" | "openai-compatible".
  provider: "claude",
  temperature: 0, // 0 = deterministic reviews; raise toward 1 for more varied output
  timeout: 180,   // per-request timeout in seconds; raise for slow local models

  providers: {
    claude: { model: "claude-haiku-4-5-20251001", apiKey: process.env.ANTHROPIC_API_KEY },
    gemini: { model: "gemini-2.5-flash", apiKey: process.env.GEMINI_API_KEY },
    ollama: { model: "llama3.2", baseUrl: "http://localhost:11434" },
    // The hyphenated key must be quoted. Retarget baseUrl to any
    // OpenAI-compatible service (OpenRouter, Groq, Together, DeepSeek, ...).
    "openai-compatible": {
      model: "gpt-4o-mini",
      baseUrl: "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY,
    },
  },
  commit: {
    blockLevel: "warning", // severity that blocks the commit
    skip: ["style"],       // categories that never block (still shown)
  },
  // Files excluded from review (glob patterns), ADDED to a built-in list
  // (lockfiles, dist/, build/, *.min.js, snapshots). Excluded files never reach
  // the model — saves tokens and noise. Set ignoreDefaults: false for your list only.
  ignore: ["docs/**", "*.generated.ts"],
  // ignoreDefaults: false,
  rules: [
    { text: "No console.log in production code", severity: "warning" },
  ],
};
```

What each setting affects:

- **`provider`** — which model service runs the review.
- **`providers.<name>.model`** — the model used for that provider.
- **`providers.<name>.apiKey`** — API key (cloud providers). Prefer reading from
  the environment; never hard-code secrets. For `openai-compatible`, use the key
  of the service `baseUrl` points at (e.g. `process.env.GROQ_API_KEY`).
- **`providers.<name>.baseUrl`** — where requests are sent: the local Ollama
  server, or — for `openai-compatible` — any OpenAI-compatible endpoint
  (OpenRouter, Groq, Together, DeepSeek, LM Studio, …). See the
  [Providers & models](#providers--models) table for example URLs.
- **`temperature`** — model sampling temperature (0–1). Default `0` gives the most
  consistent, repeatable reviews; higher values add variety. CLI `--temperature`
  overrides it.
- **`timeout`** — per-request timeout in seconds (positive integer). When unset, each
  provider keeps its own default (≈180s); raise it for slow local Ollama models. CLI
  `--timeout` overrides it.
- **`commit.blockLevel`** — minimum severity that blocks `--commit`.
- **`commit.skip`** — categories that never block (still shown in output); also
  respected by `--fail-on`.
- **`ignore`** — glob patterns for files to exclude from the diff before it's sent
  to the model (e.g. lockfiles, generated code, snapshots). These are **added** to a
  built-in default list (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `dist/**`,
  `build/**`, `*.min.js`, `*.snap`, `__snapshots__/**`). Excluded files cost no tokens
  and produce no findings. Patterns use git's `:(glob)` pathspec syntax (needs git 2.13+).
- **`ignoreDefaults`** — set to `false` to drop the built-in list and ignore only your
  own `ignore` patterns. Defaults to `true`.
- **`rules`** — your own review criteria; violations become `custom` findings
  with the severity you set, so they participate in the gate.

### Precedence

**CLI flag > config value > built-in default.** For example,
`--model gemini-2.5-pro` overrides `providers.gemini.model`, which overrides the
built-in default `gemini-2.5-flash`.

### Custom rules & prompt safety

`rules` lets you add project-specific review criteria. A violation becomes a
finding with category `custom` and the severity you set, so it participates in
the gate (block it, or `skip: ["custom"]` to allow it).

User rules and the diff are passed to the model as clearly-delimited untrusted
**data**, and the system prompt instructs the model never to follow instructions
embedded in them. As a backstop, the model's response is schema-validated — a
broken or hijacked response fails parsing, so nothing is committed.

## Continuous integration & pre-commit

The gate makes pet-reviewer scriptable. **Exit codes:** `0` — success (nothing blocked,
or committed); `1` — blocked / `--fail-on` triggered, or a configuration/model error.

**Local pre-commit hook (husky)** — reviews your uncommitted changes and blocks the
commit on serious findings:

```bash
npx husky init
echo 'npx pet-reviewer --commit' > .husky/pre-commit
```

**Gate pull requests in GitHub Actions** — `--base` reviews the branch against the PR's
base (the diff GitHub shows) and `--fail-on` fails the build on findings. Fetch full
history so the base ref is available:

```yaml
name: review
on: pull_request
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx pet-reviewer --base "origin/${{ github.base_ref }}" --fail-on warning
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

There are three mutually-exclusive gate modes: the local commit gate (`--commit`), the
CI fail gate (`--base … --fail-on`), and plain review (neither).

**This repo's own workflow** (`.github/workflows/ci.yml`) runs on every pull request: a
**test** job (suite + type check + build, which gates the PR) and an **advisory review** job
that runs the agent reviewer with Claude haiku on the PR diff and posts each finding as an
**inline comment** on the changed line (with a summary comment for findings it can't anchor)
— it never fails the check. It needs an `ANTHROPIC_API_KEY` repository secret
(Settings → Secrets and variables → Actions); pull requests from forks skip the review job.
