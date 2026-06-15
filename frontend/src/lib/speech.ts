/**
 * Browser Web Speech synthesis helpers — the fallback used to read a note
 * aloud when server-side OpenAI TTS isn't available. The goal is to avoid the
 * default robotic voice by preferring known high-quality, natural English
 * voices.
 */

// High-quality natural English voices, in order of preference. Names vary by
// platform (Apple, Google, Microsoft) so we match against several.
const PREFERRED_VOICE_NAMES = [
  "Samantha",
  "Ava",
  "Allison",
  "Google US English",
  "Microsoft Aria",
  "Microsoft Jenny",
  "Karen",
  "Moira",
  "Serena",
];

/**
 * Choose the best available English voice from `speechSynthesis.getVoices()`.
 * Prefers the curated natural voices above, then any "en*" voice that isn't a
 * low-quality "compact" variant, then any "en*" voice, then null.
 */
export function pickVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  for (const name of PREFERRED_VOICE_NAMES) {
    const match = voices.find((v) => v.name.includes(name));
    if (match) return match;
  }

  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
  const natural = english.find(
    (v) => !v.name.toLowerCase().includes("compact"),
  );
  if (natural) return natural;

  return english[0] ?? null;
}

/**
 * Resolve the available voices, awaiting the async `voiceschanged` event since
 * some browsers (notably Chrome) load voices lazily and return [] on first call.
 */
export function loadVoices(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const existing = synth.getVoices();
  if (existing.length > 0) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(synth.getVoices());
    };
    synth.addEventListener?.("voiceschanged", finish, { once: true });
    // Safety net: don't hang forever if the event never fires.
    setTimeout(finish, 500);
  });
}

/**
 * Speak `text` with a soft, natural English voice. Returns the utterance so
 * callers can wire onend/onerror. The voice is chosen via {@link pickVoice};
 * rate/pitch are tuned slightly softer than default.
 */
export function speakWithBrowser(
  synth: SpeechSynthesis,
  text: string,
  voice: SpeechSynthesisVoice | null,
): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(text);
  if (voice) utterance.voice = voice;
  utterance.lang = "en-US";
  utterance.rate = 0.95;
  utterance.pitch = 1.05;
  synth.speak(utterance);
  return utterance;
}
