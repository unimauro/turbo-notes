import { pickVoice } from "@/lib/speech";

/** Build a minimal SpeechSynthesisVoice-like object for the picker. */
function voice(name: string, lang = "en-US"): SpeechSynthesisVoice {
  return { name, lang } as SpeechSynthesisVoice;
}

describe("pickVoice", () => {
  it("returns null when there are no voices", () => {
    expect(pickVoice([])).toBeNull();
  });

  it("prefers a curated natural voice by name (Samantha) over others", () => {
    const voices = [voice("Daniel"), voice("Samantha"), voice("Google US English")];
    expect(pickVoice(voices)?.name).toBe("Samantha");
  });

  it("honours the preference order (Google US English over Karen)", () => {
    const voices = [voice("Karen"), voice("Google US English")];
    expect(pickVoice(voices)?.name).toBe("Google US English");
  });

  it("falls back to a non-compact English voice when no curated match exists", () => {
    const voices = [
      voice("Eddy (English (US)) Compact"),
      voice("Fred"),
      voice("Bols", "es-ES"),
    ];
    expect(pickVoice(voices)?.name).toBe("Fred");
  });

  it("falls back to any English voice if only compact ones remain", () => {
    const voices = [voice("Eddy Compact"), voice("Hola", "es-ES")];
    expect(pickVoice(voices)?.name).toBe("Eddy Compact");
  });
});
