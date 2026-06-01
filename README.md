# pet-reviewer

AI code reviewer CLI. It reads your `git diff`, asks an LLM (Claude, Gemini, or a
local Ollama model) to review it, prints structured findings, and can gate a
commit on the result.

## Install

```bash
npm install -D pet-reviewer
npx pet-reviewer init      # creates reviewer.config.js
```

Set your API key in the environment (e.g. via a `.env` file):

```bash
ANTHROPIC_API_KEY=sk-ant-...     # for Claude
GEMINI_API_KEY=...               # for Gemini
```

## Usage

The reviewer reads `git diff HEAD` (staged + unstaged changes).

```bash
npx pet-reviewer                 # review only
npx pet-reviewer --commit        # review, then commit if nothing blocks
npx pet-reviewer --provider gemini
```

Flags (override config): `--provider`, `--model`, `--base-url`, `--commit`,
`--block-level <critical|warning|nit>`, `--skip <categories>`.

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

Gemini and Claude run in the cloud — you only need an API key, nothing to
install. Ollama runs locally; install it and `ollama pull <model>` first. Get a
Gemini key at https://aistudio.google.com/apikey (generous free tier).

`openai-compatible` speaks the OpenAI `/chat/completions` format, so one provider
covers many services — point `baseUrl` at the one you want and set `apiKey` to
its key:

- OpenAI — `https://api.openai.com/v1` (`OPENAI_API_KEY`)
- OpenRouter — `https://openrouter.ai/api/v1` (`process.env.OPENROUTER_API_KEY`)
- Groq — `https://api.groq.com/openai/v1` (`process.env.GROQ_API_KEY`)
- Together — `https://api.together.xyz/v1`
- DeepSeek — `https://api.deepseek.com/v1`
- LM Studio (local) — `http://localhost:1234/v1`

## Severity levels

Every finding has one of three severities:

| Severity | Meaning |
|----------|---------|
| `critical` | Must fix — bugs, security holes, data loss. |
| `warning` | Should fix — likely problems or bad practice. |
| `nit` | Minor — style, naming, optional polish. |

Severities drive the commit gate. With `--commit`, a finding **blocks** the
commit when its severity is at or above `commit.blockLevel` (rank order:
`nit` < `warning` < `critical`). Categories listed in `commit.skip` never block,
even at `critical`.

## Configuration

`reviewer.config.js` (ESM `export default`; use `module.exports` in a CommonJS
project):

```js
export default {
  // Default provider: "claude" | "ollama" | "gemini".
  provider: "claude",
  providers: {
    claude: { model: "claude-haiku-4-5-20251001", apiKey: process.env.ANTHROPIC_API_KEY },
    gemini: { model: "gemini-2.5-flash", apiKey: process.env.GEMINI_API_KEY },
    ollama: { model: "llama3.2", baseUrl: "http://localhost:11434" },
  },
  commit: {
    blockLevel: "warning", // severity that blocks the commit
    skip: ["style"],       // categories that never block (still shown)
  },
  rules: [
    { text: "No console.log in production code", severity: "warning" },
  ],
};
```

What each setting affects:

- **`provider`** — which model service runs the review.
- **`providers.<name>.model`** — the model used for that provider.
- **`providers.<name>.apiKey`** — API key (cloud providers). Prefer reading from
  the environment; never hard-code secrets.
- **`providers.ollama.baseUrl`** — where your local Ollama server listens.
- **`commit.blockLevel`** — minimum severity that blocks `--commit`.
- **`commit.skip`** — categories that never block (still shown in output).
- **`rules`** — your own review criteria; violations become `custom` findings
  with the severity you set, so they participate in the gate.

### Precedence

**CLI flag > config value > built-in default.** For example,
`--model gemini-2.5-pro` overrides `providers.gemini.model`, which overrides the
built-in default `gemini-2.5-flash`.

### Custom rules & prompt safety

`rules` lets you add project-specific review criteria. A violation becomes a
finding with category `custom` and the severity you set, so it participates in
the commit gate (block it, or `skip: ["custom"]` to allow it).

User rules and the diff are passed to the model as clearly-delimited untrusted
**data**, and the system prompt instructs the model never to follow instructions
embedded in them. As a backstop, the model's response is schema-validated — a
broken or hijacked response fails parsing, so nothing is committed.
