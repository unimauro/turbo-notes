import { stripTurboClose, TURBO_CLOSE_RE } from "@/lib/voiceCommand";

describe("stripTurboClose", () => {
  it("detects and strips the command, keeping the remaining real text", () => {
    const { cleaned, triggered } = stripTurboClose(
      "remember to buy milk turbo close",
    );
    expect(triggered).toBe(true);
    expect(cleaned).toBe("remember to buy milk");
  });

  it("tolerates recognizer variants (casing, punctuation, 'closed')", () => {
    expect(stripTurboClose("Turbo, close").triggered).toBe(true);
    expect(stripTurboClose("TURBO CLOSE").triggered).toBe(true);
    expect(stripTurboClose("and then turbo closed.").triggered).toBe(true);
    expect(stripTurboClose("and then turbo closed.").cleaned).toBe("and then");
  });

  it("strips the command from the middle and collapses whitespace", () => {
    const { cleaned, triggered } = stripTurboClose(
      "first part turbo close second part",
    );
    expect(triggered).toBe(true);
    expect(cleaned).toBe("first part second part");
  });

  it("leaves a normal note without the phrase unaffected", () => {
    const { cleaned, triggered } = stripTurboClose(
      "I should close the window later",
    );
    expect(triggered).toBe(false);
    expect(cleaned).toBe("I should close the window later");
  });

  it("does not match 'turbo' or 'close' on their own", () => {
    expect(stripTurboClose("the turbo engine roared").triggered).toBe(false);
    expect(stripTurboClose("please close the door").triggered).toBe(false);
  });

  it("returns an empty cleaned string when the command is the whole transcript", () => {
    const { cleaned, triggered } = stripTurboClose("turbo close");
    expect(triggered).toBe(true);
    expect(cleaned).toBe("");
  });

  it("exposes the lenient case-insensitive regex", () => {
    expect(TURBO_CLOSE_RE.test("Turbo  close")).toBe(true);
  });
});
