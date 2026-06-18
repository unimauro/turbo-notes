import { useCallback, useEffect, useState, type RefObject } from "react";

import { assist, getAssistEnabled } from "@/services/assist";
import type { CategoryRef } from "@/types/note";

/** The autosave snapshot the editor treats as authoritative. */
type Snapshot = {
  title: string;
  content: string;
  category: CategoryRef | undefined;
};

interface UseAiAssistArgs {
  /** Current note body; assist acts on it, so a blank body disables the actions. */
  content: string;
  /** Builds the text handed to the assist API (title + content). */
  noteText: () => string;
  /** Authoritative autosave snapshot — writes merge onto it, never the stale closure. */
  latestRef: RefObject<Snapshot>;
  /** Schedules a debounced autosave with the given snapshot. */
  scheduleSave: (snapshot: Snapshot) => void;
  setTitle: (value: string) => void;
  setContent: (value: string) => void;
}

export interface UseAiAssist {
  /** Whether the backend reported an OpenAI key (GET /assist/); buttons hide when false. */
  enabled: boolean;
  titleLoading: boolean;
  summaryLoading: boolean;
  error: string | null;
  summary: string | null;
  dismissSummary: () => void;
  /** True once the body has real (non-whitespace) text — gates both actions. */
  hasText: boolean;
  suggestTitle: () => void;
  summarize: () => void;
  insertSummary: () => void;
}

/**
 * AI "assist" actions for the editor — suggest a title and summarize — plus the
 * one-shot availability probe. Extracted from NoteEditor to keep that component
 * focused and to make this logic unit-testable in isolation. There is no free
 * fallback (unlike dictation/TTS): when the backend reports `enabled: false`
 * (no API key) the buttons are simply hidden.
 *
 * Every write goes through the SAME `latestRef` + `scheduleSave` path as the
 * editor's field handlers, so a suggested title or inserted summary autosaves
 * and is never clobbered by a concurrent dictation/field write.
 */
export function useAiAssist({
  content,
  noteText,
  latestRef,
  scheduleSave,
  setTitle,
  setContent,
}: UseAiAssistArgs): UseAiAssist {
  const [enabled, setEnabled] = useState(false);
  // Independent loading flags so one action's spinner doesn't disable the other.
  const [titleLoading, setTitleLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The summary is shown non-destructively in a dismissible inline card.
  const [summary, setSummary] = useState<string | null>(null);

  // Decide availability ONCE on open (GET /assist/).
  useEffect(() => {
    let cancelled = false;
    getAssistEnabled()
      .then((value) => {
        if (!cancelled) setEnabled(value);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Both actions act on the content, so an empty/whitespace-only body disables them.
  const hasText = content.trim().length > 0;

  // "Suggest title": send title+content (or just content), set the title field
  // through the latestRef + scheduleSave path so it autosaves and isn't clobbered
  // by a concurrent dictation/field write.
  const suggestTitle = useCallback(() => {
    const text = noteText();
    if (!text || titleLoading) return;
    setError(null);
    setTitleLoading(true);
    assist(text, "title")
      .then((suggestion) => {
        const next = suggestion.trim();
        if (!next) return;
        setTitle(next);
        const snapshot = latestRef.current;
        scheduleSave({
          title: next,
          content: snapshot.content,
          category: snapshot.category,
        });
      })
      .catch(() => setError("Couldn't suggest a title. Please try again."))
      .finally(() => setTitleLoading(false));
  }, [noteText, titleLoading, setTitle, latestRef, scheduleSave]);

  // "Summarize": show the summary in a dismissible card (non-destructive).
  const summarize = useCallback(() => {
    const text = noteText();
    if (!text || summaryLoading) return;
    setError(null);
    setSummaryLoading(true);
    assist(text, "summary")
      .then((result) => setSummary(result.trim() || null))
      .catch(() => setError("Couldn't summarize. Please try again."))
      .finally(() => setSummaryLoading(false));
  }, [noteText, summaryLoading]);

  // Prepend "Summary: <text>" to the note content, via latestRef + scheduleSave.
  const insertSummary = useCallback(() => {
    if (!summary) return;
    const snapshot = latestRef.current;
    const next = `Summary: ${summary}\n\n${snapshot.content}`;
    setContent(next);
    scheduleSave({
      title: snapshot.title,
      content: next,
      category: snapshot.category,
    });
    setSummary(null);
  }, [summary, latestRef, scheduleSave, setContent]);

  const dismissSummary = useCallback(() => setSummary(null), []);

  return {
    enabled,
    titleLoading,
    summaryLoading,
    error,
    summary,
    dismissSummary,
    hasText,
    suggestTitle,
    summarize,
    insertSummary,
  };
}
