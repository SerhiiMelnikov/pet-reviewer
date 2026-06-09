import { describe, it, expect } from "vitest";
import { colorEnabled } from "../src/colors";

describe("colorEnabled", () => {
  it("enables on a TTY, disables when piped", () => {
    expect(colorEnabled({}, true)).toBe(true);
    expect(colorEnabled({}, false)).toBe(false);
  });

  it("ignores the CI heuristic when piped (the bug)", () => {
    expect(colorEnabled({ CI: "true" }, false)).toBe(false);
  });

  it("respects NO_COLOR and FORCE_COLOR", () => {
    expect(colorEnabled({ NO_COLOR: "1" }, true)).toBe(false);
    expect(colorEnabled({ FORCE_COLOR: "1" }, false)).toBe(true);
  });
});
