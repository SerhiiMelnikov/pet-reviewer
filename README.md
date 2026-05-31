# pet-reviewer

AI code reviewer CLI. It reads your `git diff`, asks an LLM (Claude or a local
Ollama model) to review it, prints structured findings, and can gate a commit
on the result.

## Install

```bash
npm install -D pet-reviewer
npx pet-reviewer init      # creates reviewer.config.js
```

Set your Anthropic key in the environment (e.g. via a `.env` file):

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

## Usage

Stage your changes first (`git add ...`) — the reviewer reads `git diff HEAD`.

```bash
npx pet-reviewer                 # review only
npx pet-reviewer --commit        # review, then commit if nothing blocks
npx pet-reviewer --provider ollama
```

Flags (override config): `--provider`, `--model`, `--base-url`, `--commit`,
`--block-level <critical|warning|nit>`, `--skip <categories>`.

## Configuration

`reviewer.config.js` (ESM `export default`; use `module.exports` in a CommonJS
project):

```js
export default {
  provider: "claude",
  providers: {
    claude: {
      model: "claude-haiku-4-5-20251001",
      apiKey: process.env.ANTHROPIC_API_KEY, // read from the environment
    },
    ollama: {
      model: "llama3.2",
      baseUrl: "http://localhost:11434",
    },
  },
  commit: {
    blockLevel: "warning",   // severity that blocks the commit
    skip: ["style"],         // categories that never block (still shown)
  },
  rules: [
    // Violations are reported under the "custom" category, with this severity.
    { text: "No console.log in production code", severity: "warning" },
  ],
};
```

Precedence: **CLI flag > config value > built-in default.**

The API key is resolved from `providers.claude.apiKey` first, then from
`ANTHROPIC_API_KEY`. Keep secrets in the environment — do not hard-code them.

### Custom rules & prompt safety

`rules` lets you add project-specific review criteria. A violation becomes a
finding with category `custom` and the severity you set, so it participates in
the commit gate (block it, or `skip: ["custom"]` to allow it).

User rules and the diff are passed to the model as clearly-delimited untrusted
**data**, and the system prompt instructs the model never to follow instructions
embedded in them. As a backstop, the model's response is schema-validated — a
broken or hijacked response fails parsing, so nothing is committed.
