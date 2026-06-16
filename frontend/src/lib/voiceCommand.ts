/**
 * Hands-free voice command: "close my note".
 *
 * Spoken into the dictation/Whisper transcript, "close my note" tells the editor
 * to finish the note and gracefully close itself. The legacy "turbo close" phrase
 * stays supported as an alias. Speech recognition tends to insert punctuation/
 * casing variants ("Close my Note.", "Turbo, close", "turbo closed."), so the
 * matcher is deliberately lenient and case-insensitive.
 */

/**
 * Matches the primary command "close my note"/"close my notes" AND the legacy
 * alias "turbo close" (and recognizer variants like "Close my Note.",
 * "Turbo, close", "Turboclose" or "turbo closed"): either "clos" + any word
 * chars, then "my", then "note(s)"; or the word "turbo", optional whitespace/
 * punctuation, then "clos" followed by any word chars.
 */
export const TURBO_CLOSE_RE =
  /\b(?:clos\w*\s+my\s+notes?|turbo[\s,.]*clos\w*)\b/i;

export interface StripTurboCloseResult {
  /** The transcript with the command phrase removed and whitespace tidied. */
  cleaned: string;
  /** True when the command phrase was present in the input. */
  triggered: boolean;
}

/**
 * Detect and strip the "close my note" command (or its "turbo close" alias)
 * from a transcript segment.
 *
 * Returns the remaining real text (so the literal command words never end up in
 * the note) and whether the command was triggered. A transcript without the
 * phrase is returned untouched (trimmed) with `triggered: false`.
 */
export function stripTurboClose(text: string): StripTurboCloseResult {
  const triggered = TURBO_CLOSE_RE.test(text);
  if (!triggered) {
    return { cleaned: text.trim(), triggered: false };
  }
  const cleaned = text
    .replace(TURBO_CLOSE_RE, " ")
    // Drop punctuation orphaned by the removal (e.g. a trailing "." from
    // "close my note." or "turbo closed."), then collapse double spaces.
    .replace(/\s+[,.;:!?]+(?=\s|$)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { cleaned, triggered: true };
}
