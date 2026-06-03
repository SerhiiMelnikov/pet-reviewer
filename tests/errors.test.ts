import { describe, it, expect } from "vitest";
import { ReviewerError, EErrorCode, ERRORS } from "../src/errors";

describe("ReviewerError", () => {
  it("stores the code and prefixes the message", () => {
    const err = new ReviewerError(EErrorCode.ProviderTimeout, "boom");
    expect(err.code).toBe("2.1");
    expect(err.message).toBe("[2.1] boom");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("ERRORS", () => {
  it("builds a timeout error", () => {
    const err = ERRORS.providerTimeout("Gemini", 180);
    expect(err.code).toBe(EErrorCode.ProviderTimeout);
    expect(err.message).toContain("Gemini");
    expect(err.message).toContain("timed out");
  });

  it("builds a missing-api-key error", () => {
    const err = ERRORS.missingApiKey("GEMINI_API_KEY", "providers.gemini.apiKey", "https://x");
    expect(err.code).toBe(EErrorCode.MissingApiKey);
    expect(err.message).toContain("GEMINI_API_KEY");
  });

  it("builds the agent error codes", () => {
    expect(ERRORS.agentUnsupported("ollama").code).toBe(EErrorCode.AgentUnsupported);
    expect(ERRORS.agentUnsupported("ollama").message).toContain("ollama");
    expect(ERRORS.cliMaxSteps("x").code).toBe(EErrorCode.CliMaxSteps);
  });

  it("builds the temperature errors", () => {
    expect(ERRORS.configTemperature("reviewer.config.js", "2").code).toBe(EErrorCode.ConfigTemperature);
    expect(ERRORS.configTemperature("reviewer.config.js", "2").message).toContain("between 0 and 1");
    expect(ERRORS.cliTemperature("nope").code).toBe(EErrorCode.CliTemperature);
    expect(ERRORS.cliTemperature("nope").message).toContain("--temperature");
  });

  it("builds the base+commit error", () => {
    expect(ERRORS.cliBaseCommit().code).toBe(EErrorCode.CliBaseCommit);
    expect(ERRORS.cliBaseCommit().message).toContain("--base");
    expect(ERRORS.cliBaseCommit().message).toContain("--commit");
  });
});
