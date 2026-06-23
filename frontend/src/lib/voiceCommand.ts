/**
 * Hands-free voice command: "close my note" / "save my note".
 *
 * Spoken into the dictation/Whisper transcript, "close my note" (or "save my
 * note") tells the editor to finish the note and gracefully close itself. The
 * legacy "turbo close" phrase stays supported as an alias. Speech recognition
 * tends to insert punctuation/casing variants ("Close my Note.", "Save my
 * notes", "Turbo, close", "turbo closed."), so the matcher is deliberately
 * lenient and case-insensitive.
 */

/**
 * Matches the primary commands "close my note(s)" / "save my note(s)" AND the
 * legacy alias "turbo close" (plus recognizer variants like "Close my Note.",
 * "Save my notes", "Turbo, close", "Turboclose" or "turbo closed"): either
 * "clos"/"sav" + any word chars, then "my", then "note(s)"; or the word
 * "turbo", optional whitespace/punctuation, then "clos" followed by any word
 * chars.
 */
export const TURBO_CLOSE_RE =
  /\b(?:(?:clos|sav)\w*\s+my\s+notes?|turbo[\s,.]*clos\w*)\b/i;

/**
 * Pure predicate used by the real-time command listener (and easily unit
 * tested): does this rolling transcript contain the finish command?
 *
 * The browser `SpeechRecognition` listener accumulates interim + final results
 * into a single rolling string and calls this on every result; it's just a thin
 * wrapper over {@link TURBO_CLOSE_RE} so the matching logic has one home.
 */
export function matchesTurboClose(transcript: string): boolean {
  return TURBO_CLOSE_RE.test(transcript);
}

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

/**
 * Hands-free "change category to <name>" command.
 *
 * Matches "change/switch/set [the] category [to] <rest>" (lenient, case-
 * insensitive). The captured `<rest>` is the spoken candidate — the category
 * name plus any dictation that followed in the same breath — which the caller
 * resolves against the user's actual categories via {@link resolveCategory}.
 */
export const CHANGE_CATEGORY_RE =
  /\b(?:change|switch|set)\s+(?:the\s+)?category\s+(?:to\s+)?(?:the\s+)?(.*)$/i;

export interface ChangeCategoryResult {
  triggered: boolean;
  /** Spoken text AFTER the command lead-in (candidate name + trailing dictation). */
  candidate: string;
  /** Spoken text BEFORE the command lead-in (kept as real dictation). */
  before: string;
}

export function parseChangeCategory(text: string): ChangeCategoryResult {
  const match = CHANGE_CATEGORY_RE.exec(text);
  if (!match) return { triggered: false, candidate: "", before: "" };
  return {
    triggered: true,
    before: text.slice(0, match.index).trim(),
    candidate: (match[1] ?? "").trim(),
  };
}

/**
 * Resolve a spoken candidate against the known category names, matching the
 * LONGEST name whose words prefix the candidate (so "Random Thoughts" wins over
 * a bare "Random"). Returns the matched name (original casing) and the leftover
 * dictation after it, or `{ name: null }` when nothing matches.
 */
export function resolveCategory(
  candidate: string,
  names: string[],
): { name: string | null; rest: string } {
  const words = candidate.trim().split(/\s+/).filter(Boolean);
  const lc = words.map((w) => w.toLowerCase().replace(/[.,;:!?]+$/, ""));
  let best: string | null = null;
  let bestLen = 0;
  for (const name of names) {
    const nameWords = name.toLowerCase().split(/\s+/);
    const isPrefix =
      nameWords.length <= lc.length && nameWords.every((w, i) => w === lc[i]);
    if (isPrefix && nameWords.length > bestLen) {
      best = name;
      bestLen = nameWords.length;
    }
  }
  if (best === null) return { name: null, rest: candidate.trim() };
  return { name: best, rest: words.slice(bestLen).join(" ").trim() };
}
