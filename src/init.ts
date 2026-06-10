import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILENAME } from "./config";
import { ERRORS } from "./errors";

export const CONFIG_TEMPLATE = `export default {
  // Which provider to use by default: "claude", "ollama", "gemini", or "openai-compatible".
  provider: "claude",

  providers: {
    claude: {
      model: "claude-haiku-4-5-20251001",
      // The key is read from the environment; never hard-code it here.
      apiKey: process.env.ANTHROPIC_API_KEY,
    },
    ollama: {
      model: "llama3.2",
      baseUrl: "http://localhost:11434",
    },
    gemini: {
      model: "gemini-2.5-flash",
      // The key is read from the environment; never hard-code it here.
      apiKey: process.env.GEMINI_API_KEY,
    },
    "openai-compatible": {
      model: "gpt-4o-mini",
      // Point baseUrl at any OpenAI-compatible service (OpenRouter, Groq, ...).
      baseUrl: "https://api.openai.com/v1",
      // Set apiKey to that service's key variable.
      apiKey: process.env.OPENAI_API_KEY,
    },
  },

  // Commit gate (applies with --commit).
  commit: {
    // Severity that blocks the commit: "critical" | "warning" | "nit".
    blockLevel: "warning",
    // Categories that never block (still shown), e.g. ["style", "readability", "custom"].
    skip: [],
  },

  // Files excluded from review (glob patterns). These are ADDED to a built-in list
  // (lockfiles, dist/, build/, *.min.js, snapshots). Set ignoreDefaults: false to
  // use only your own patterns.
  ignore: [],
  // ignoreDefaults: false,

  // Your own review rules. Violations are reported under the "custom" category
  // with the severity you declare here.
  rules: [
    // { text: "No console.log in production code", severity: "warning" },
  ],
};
`;

export function initConfig(cwd: string = process.cwd(), force = false): string {
  const path = join(cwd, CONFIG_FILENAME);
  if (existsSync(path) && !force) {
    throw ERRORS.initConfigExists(CONFIG_FILENAME);
  }
  writeFileSync(path, CONFIG_TEMPLATE, "utf8");
  return path;
}
