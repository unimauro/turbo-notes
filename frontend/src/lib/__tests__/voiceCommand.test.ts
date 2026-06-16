import { stripTurboClose, TURBO_CLOSE_RE } from "@/lib/voiceCommand";

describe("stripTurboClose", () => {
  it("detects and strips the primary command, keeping the remaining real text", () => {
    const { cleaned, triggered } = stripTurboClose(
      "remember to buy milk close my note",
    );
    expect(triggered).toBe(true);
    expect(cleaned).toBe("remember to buy milk");
  });

  it("handles the plural and trailing punctuation ('close my notes.')", () => {
    const { cleaned, triggered } = stripTurboClose("close my notes.");
    expect(triggered).toBe(true);
    expect(cleaned).toBe("");
  });

  it("tolerates casing and strips a trailing command ('Close my Note')", () => {
    const { cleaned, triggered } = stripTurboClose(
      "I'm done. Close my Note",
    );
    expect(triggered).toBe(true);
    // The sentence's own period stays attached; only the command words go.
    expect(cleaned).toBe("I'm done.");
  });

  it("still supports the legacy 'turbo close' alias (casing/punctuation/'closed')", () => {
    expect(stripTurboClose("turbo close").triggered).toBe(true);
    expect(stripTurboClose("Turbo, close").triggered).toBe(true);
    expect(stripTurboClose("TURBO CLOSE").triggered).toBe(true);
    expect(stripTurboClose("and then turbo closed.").triggered).toBe(true);
    expect(stripTurboClose("and then turbo closed.").cleaned).toBe("and then");
  });

  it("leaves a normal note without the phrase unaffected", () => {
    const { cleaned, triggered } = stripTurboClose(
      "I should close the window later",
    );
    expect(triggered).toBe(false);
    expect(cleaned).toBe("I should close the window later");
  });

  it("does not match 'close'/'note'/'turbo' on their own", () => {
    expect(stripTurboClose("the turbo engine roared").triggered).toBe(false);
    expect(stripTurboClose("please close the door").triggered).toBe(false);
    expect(stripTurboClose("a note to self").triggered).toBe(false);
  });

  it("exposes the lenient case-insensitive regex", () => {
    expect(TURBO_CLOSE_RE.test("Close my note")).toBe(true);
    expect(TURBO_CLOSE_RE.test("Turbo  close")).toBe(true);
  });
});
