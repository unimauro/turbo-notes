/**
 * Branded hands-free voice command: "Turbo close".
 *
 * Spoken into the dictation/Whisper transcript, "turbo close" tells the editor
 * to finish the note and gracefully close itself. Speech recognition tends to
 * insert punctuation/casing variants ("Turbo, close", "turbo closed."), so the
 * matcher is deliberately lenient and case-insensitive.
 */

/**
 * Matches the spoken command "turbo close" (and recognizer variants like
 * "Turbo, close" or "turbo closed"): the word "turbo", optional whitespace/
 * punctuation, then "clos" followed by any word chars.
 */
export const TURBO_CLOSE_RE = /\bturbo[\s,.]*clos\w*\b/i;

export interface StripTurboCloseResult {
  /** The transcript with the command phrase removed and whitespace tidied. */
  cleaned: string;
  /** True when the command phrase was present in the input. */
  triggered: boolean;
}

/**
 * Detect and strip the "Turbo close" command from a transcript segment.
 *
 * Returns the remaining real text (so the literal words "turbo close" never end
 * up in the note) and whether the command was triggered. A transcript without
 * the phrase is returned untouched (trimmed) with `triggered: false`.
 */
export function stripTurboClose(text: string): StripTurboCloseResult {
  const triggered = TURBO_CLOSE_RE.test(text);
  if (!triggered) {
    return { cleaned: text.trim(), triggered: false };
  }
  const cleaned = text
    .replace(TURBO_CLOSE_RE, " ")
    // Drop punctuation orphaned by the removal (e.g. a trailing "." from
    // "turbo closed."), then collapse the resulting double spaces.
    .replace(/\s+[,.;:!?]+(?=\s|$)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { cleaned, triggered: true };
}
