"use client";

import {
  Check,
  ChevronDown,
  Headphones,
  Loader2,
  Mic,
  Plus,
  Sparkles,
  Square,
  Text,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import CategoryCreateModal from "@/components/CategoryCreateModal";
import { useAiAssist } from "@/hooks/useAiAssist";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useCreateNote, useUpdateNote } from "@/hooks/useNotes";
import { useReadAloud } from "@/hooks/useReadAloud";
import { useVoiceDictation } from "@/hooks/useVoiceDictation";
import { categoryPalette } from "@/lib/colors";
import { formatEditorTimestamp } from "@/lib/time";
import { resolveCategory } from "@/lib/voiceCommand";
import { assist } from "@/services/assist";
import type { ListNotesParams } from "@/services/notes";
import type { Category, CategoryRef, Note, NoteInput } from "@/types/note";

export const AUTOSAVE_DELAY_MS = 800;

const FALLBACK_CATEGORY: CategoryRef = {
  id: -1,
  name: "Random Thoughts",
  color: "coral",
};

interface NoteEditorProps {
  /** Existing note to edit, or null to create a new one. */
  note: Note | null;
  categories: Category[];
  /** The board's current list params, so optimistic creates land in the right page. */
  activeParams: ListNotesParams;
  onClose: () => void;
}

/**
 * Fullscreen takeover editor per the prototype. There is NO save button:
 * changes are autosaved (debounced 800ms) — the note is created on the first
 * change and PATCHed afterwards — and any pending change is flushed on close.
 */
export default function NoteEditor({
  note,
  categories,
  activeParams,
  onClose,
}: NoteEditorProps) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const [pickedCategory, setPickedCategory] = useState<CategoryRef | undefined>(
    note?.category,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(
    note?.updated_at ?? null,
  );
  const [openedAt] = useState(() => new Date().toISOString());
  // Surfaced when the final flush on close fails; we keep the editor open so the
  // user doesn't lose their last edit.
  const [saveError, setSaveError] = useState<string | null>(null);

  // ---- "Turbo close" hands-free command -----------------------------------
  // Set while the whole editor overlay is "evaporating" out (under the
  // forming-card transition) just before we call onClose().
  const [evaporating, setEvaporating] = useState(false);
  // ---- "Card being created" close transition ------------------------------
  // On close — voice OR the X button — we briefly show a forming-card overlay
  // (a card assembling itself with the note's title materializing) before the
  // editor leaves and the real board card appears, so the hand-off reads as
  // continuous. `forming` holds the snapshot rendered in that overlay (null =
  // hidden); `formingNaming` shows the "Creating your card…" line while the AI
  // is naming an untitled note; `formingSettle` plays the final settle-out beat.
  const [forming, setForming] = useState<{
    title: string;
    color: string | undefined;
    category: string | undefined;
  } | null>(null);
  const [formingNaming, setFormingNaming] = useState(false);
  const [formingSettle, setFormingSettle] = useState(false);

  // Derived (no effect needed): user pick > note's category > seeded default.
  const category =
    pickedCategory ??
    categories.find((c) => c.name === "Random Thoughts") ??
    categories[0];

  const createMutation = useCreateNote(activeParams);
  const updateMutation = useUpdateNote();

  // ---- autosave machinery -------------------------------------------------
  // Refs are only written inside event handlers / async callbacks, never
  // during render (React Compiler rule).
  const idRef = useRef<number | null>(note?.id ?? null);
  const dirtyRef = useRef(false);
  const busyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<{
    title: string;
    content: string;
    category: CategoryRef | undefined;
  }>({ title: note?.title ?? "", content: note?.content ?? "", category });

  // Resolves to `true` when everything is persisted, `false` if a save failed
  // and a dirty change remains (so callers like handleClose can react).
  const flush = useCallback(async (): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // A loop is already running; it will pick up the latest changes. We can't
    // know its outcome here, so report the current dirty state optimistically.
    if (busyRef.current) return !dirtyRef.current;

    busyRef.current = true;
    try {
      while (dirtyRef.current) {
        dirtyRef.current = false;
        const snapshot = latestRef.current;
        const input: NoteInput = {
          title: snapshot.title,
          content: snapshot.content,
          ...(snapshot.category && snapshot.category.id > 0
            ? { category_id: snapshot.category.id }
            : {}),
        };
        try {
          if (idRef.current == null) {
            const created = await createMutation.mutateAsync({
              input,
              category: snapshot.category ?? FALLBACK_CATEGORY,
            });
            idRef.current = created.id;
            setLastSavedAt(created.updated_at);
          } else {
            const updated = await updateMutation.mutateAsync({
              id: idRef.current,
              input,
              category: snapshot.category,
            });
            setLastSavedAt(updated.updated_at);
          }
        } catch {
          dirtyRef.current = true; // retried on the next change/close
          break;
        }
      }
    } finally {
      busyRef.current = false;
    }
    return !dirtyRef.current;
  }, [createMutation, updateMutation]);

  const scheduleSave = useCallback(
    (snapshot: { title: string; content: string; category: CategoryRef | undefined }) => {
      latestRef.current = snapshot;
      dirtyRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void flush();
      }, AUTOSAVE_DELAY_MS);
    },
    [flush],
  );

  // Clear any pending timer on unmount (close already flushed).
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const closingRef = useRef(false);
  async function handleClose() {
    if (closingRef.current) return; // ignore double-clicks while flushing
    closingRef.current = true;
    voice.stop(); // end any in-flight recognition first
    readAloud.stop(); // and any in-flight read-aloud playback
    let ok = false;
    try {
      // Await the final flush: if the last save rejects we must NOT unmount, or
      // the pending edit is lost silently.
      ok = await flush();
    } catch {
      ok = false;
    }
    if (!ok) {
      closingRef.current = false;
      // Keep the editor open so the user can retry; their text is still here.
      // (Flush failed — do NOT animate or close: no data loss.)
      setSaveError("Couldn't save your changes. Please try again.");
      return;
    }

    setSaveError(null);

    // Play the "card being created" forming-card transition, THEN unmount. For
    // consistency with the voice path, an untitled note with content gets named
    // by AI (when enabled) inside the overlay — best-effort, never blocking. We
    // keep closingRef held through the animation so a second X/Escape can't
    // double-trigger.
    await playFormingCard(buildNameTitle());
    closingRef.current = false;
  }

  const noteText = useCallback(
    () => [title, content].filter(Boolean).join("\n").trim(),
    [title, content],
  );

  // ---- AI assist (suggest a title / summarize) ----------------------------
  // Extracted into a hook (testable in isolation); every write still flows
  // through the editor's latestRef + scheduleSave path. `ai.enabled` also gates
  // the AI title-gen inside the close/turbo-close forming-card finale below.
  const ai = useAiAssist({
    content,
    noteText,
    latestRef,
    scheduleSave,
    setTitle,
    setContent,
  });

  // ---- "Listen" (read note aloud) — extracted hook ------------------------
  const readAloud = useReadAloud({ noteText });

  // ---- "Card being created" forming-card transition -----------------------
  // Shared close finale used by BOTH the voice (turboClose) and X/Escape
  // (handleClose) paths: evaporate the editor, reveal a centered forming-card
  // overlay (tinted with the note's category color), optionally name an untitled
  // note with AI WHILE the overlay shows a "Creating your card…" line (the title
  // then materializes in its place), hold a beat, then settle into the board and
  // call onClose(). Reduced-motion degrades to a plain fade (CSS) but the title
  // still shows. Resilient: a failing assist or flush never throws — it always
  // ends in onClose().
  //
  // `nameTitle` (optional): when provided AND the snapshot has no title but has
  // content, it's awaited to fetch a title (shown materializing in the card).
  // It must never throw (callers wrap their assist call) and may return "" to
  // mean "no title produced".
  const playFormingCard = useCallback(
    async (nameTitle?: () => Promise<string>) => {
      const snapshot = latestRef.current;
      const hasTitle = !!snapshot.title.trim();
      const willName = !hasTitle && !!snapshot.content.trim() && !!nameTitle;

      setForming({
        title: snapshot.title.trim() || "Untitled",
        color: snapshot.category?.color,
        category: snapshot.category?.name,
      });
      setFormingNaming(willName);
      // Evaporate the editor out from under the overlay.
      setEvaporating(true);
      await new Promise((resolve) => setTimeout(resolve, 360));

      // Name the untitled note while the overlay shows "Creating your card…".
      if (willName && nameTitle) {
        const suggestion = (await nameTitle()).trim();
        if (suggestion) {
          setTitle(suggestion);
          const latest = latestRef.current;
          scheduleSave({
            title: suggestion,
            content: latest.content,
            category: latest.category,
          });
          // Swap the line for the title, which materializes into the card.
          setForming((f) => (f ? { ...f, title: suggestion } : f));
        }
        setFormingNaming(false);
      }

      // Hold the formed card so the materialized title reads before hand-off.
      await new Promise((resolve) => setTimeout(resolve, 620));
      // Settle the overlay into the board, then unmount.
      setFormingSettle(true);
      await new Promise((resolve) => setTimeout(resolve, 320));
      try {
        await flush();
      } catch {
        // Close regardless of a late flush failure (the note already saved its
        // content; the title autosaves on the next change if this slips).
      }
      onClose();
    },
    [flush, onClose, scheduleSave],
  );

  // Best-effort AI title for an untitled note, shared by BOTH close paths (the X
  // button and the hands-free turbo close). Returns undefined when assist is off
  // so the forming-card finale skips naming; the closure itself never throws.
  const buildNameTitle = useCallback(
    () =>
      ai.enabled
        ? async () => {
            const body = latestRef.current.content.trim();
            if (!body) return "";
            try {
              return await assist(body, "title");
            } catch {
              return "";
            }
          }
        : undefined,
    [ai.enabled],
  );

  // Hands-free "change category to X": resolve the spoken candidate against the
  // editor's categories; on a match, switch the note's category (persisted via
  // the snapshot) and return the leftover dictation. null => no known category.
  const handleCategoryCommand = useCallback(
    (candidate: string) => {
      const { name, rest } = resolveCategory(
        candidate,
        categories.map((c) => c.name),
      );
      if (!name) return null;
      const picked = categories.find((c) => c.name === name);
      if (!picked) return null;
      setPickedCategory(picked);
      const snapshot = latestRef.current;
      scheduleSave({
        title: snapshot.title,
        content: snapshot.content,
        category: picked,
      });
      return { rest };
    },
    [categories, scheduleSave],
  );

  // ---- Voice dictation (Web Speech + Whisper + hands-free close) — hook ----
  // The full dictation/transcription pipeline and the "turbo close" race
  // handling live in the hook; it hands off to the shared forming-card finale.
  const voice = useVoiceDictation({
    latestRef,
    scheduleSave,
    setContent,
    playFormingCard,
    buildNameTitle,
    stopReadAloud: readAloud.stop,
    onCategoryCommand: handleCategoryCommand,
  });

  // ---- UI -----------------------------------------------------------------
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  useFocusTrap(containerRef);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Escape precedence: an open category menu closes first, then active
  // dictation stops (so a panicked Escape silences the mic without losing the
  // editor), and only an Escape with nothing pending closes the editor.
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    if (menuOpen) {
      setMenuOpen(false);
    } else if (voice.recording) {
      // Stop whichever capture mode is active (Whisper or Web Speech) first.
      voice.stop();
    } else {
      handleClose();
    }
  }

  const palette = categoryPalette(category?.color);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={note ? "Edit note" : "New note"}
      onKeyDown={handleKeyDown}
      className={`fixed inset-0 z-40 flex flex-col bg-cream px-4 py-4 sm:px-8 sm:py-6 dark:bg-bark ${
        evaporating ? "turbo-evaporate" : "editor-enter"
      }`}
    >
      <header className="flex items-center justify-between">
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-ink-line bg-paper px-4 text-sm font-semibold text-ink transition-colors hover:bg-[#EFE3C8] dark:border-linen-soft/60 dark:bg-bark-soft dark:text-linen dark:hover:bg-[#46382a]"
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: palette.dot }}
            />
            {category?.name ?? "Category"}
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>

          {menuOpen && (
            <>
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
              <ul
                role="listbox"
                aria-label="Category"
                className="absolute left-0 z-20 mt-2 w-56 rounded-xl border border-ink-line bg-paper p-1.5 shadow-lg dark:border-linen-soft/60 dark:bg-bark-soft"
              >
                {categories.map((c) => {
                  const cPalette = categoryPalette(c.color);
                  const selected = category?.id === c.id;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          setPickedCategory(c);
                          setMenuOpen(false);
                          // Recolors instantly, persists shortly after. Merge
                          // onto the authoritative snapshot so we don't clobber
                          // title/content appended via latestRef (dictation).
                          const snapshot = latestRef.current;
                          scheduleSave({
                            title: snapshot.title,
                            content: snapshot.content,
                            category: c,
                          });
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-ink/10 dark:text-linen dark:hover:bg-linen/10"
                      >
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: cPalette.dot }}
                        />
                        <span className="flex-1">{c.name}</span>
                        {selected && (
                          <Check className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </li>
                  );
                })}
                <li
                  role="presentation"
                  className="mt-1 border-t border-ink-line/60 pt-1 dark:border-linen-soft/30"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setCategoryModalOpen(true);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-ink/10 dark:text-linen dark:hover:bg-linen/10"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    <span className="flex-1">Create New Category</span>
                  </button>
                </li>
              </ul>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={handleClose}
          aria-label="Close editor"
          className="rounded-full p-2 text-ink transition-colors hover:bg-ink/10 dark:text-linen dark:hover:bg-linen/10"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      <div
        style={{ backgroundColor: palette.bg, borderColor: palette.border }}
        className="tinted relative mt-4 flex min-h-0 flex-1 flex-col rounded-2xl border p-6 sm:p-10"
      >
        <p className="text-right text-xs text-ink/70">
          Last Edited: {formatEditorTimestamp(lastSavedAt ?? openedAt)}
        </p>

        <label htmlFor="editor-title" className="sr-only">
          Note title
        </label>
        <input
          id="editor-title"
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => {
            const value = e.target.value;
            setTitle(value);
            // Merge onto the authoritative snapshot so we never clobber content
            // just appended by dictation/Whisper (which write via latestRef).
            const snapshot = latestRef.current;
            scheduleSave({
              title: value,
              content: snapshot.content,
              category: snapshot.category,
            });
          }}
          placeholder="Note Title"
          className="mt-3 w-full bg-transparent font-serif text-3xl font-bold text-ink placeholder:text-ink/40 focus:outline-none"
        />

        {ai.enabled && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={ai.suggestTitle}
              disabled={!ai.hasText || ai.titleLoading}
              aria-busy={ai.titleLoading}
              aria-label="Suggest a title"
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-paper/60 px-3 py-1.5 text-xs font-semibold text-ink/80 transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50 dark:border-linen/15 dark:bg-bark-soft/50 dark:text-linen/80 dark:hover:bg-bark-soft"
            >
              {ai.titleLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Suggest title
            </button>
            <button
              type="button"
              onClick={ai.summarize}
              disabled={!ai.hasText || ai.summaryLoading}
              aria-busy={ai.summaryLoading}
              aria-label="Summarize note"
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-paper/60 px-3 py-1.5 text-xs font-semibold text-ink/80 transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50 dark:border-linen/15 dark:bg-bark-soft/50 dark:text-linen/80 dark:hover:bg-bark-soft"
            >
              {ai.summaryLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Text className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Summarize
            </button>
            {ai.error && (
              <span role="status" className="text-xs text-red-600 dark:text-red-400">
                {ai.error}
              </span>
            )}
          </div>
        )}

        {ai.summary && (
          <div
            role="status"
            className="mt-3 rounded-xl border border-ink/15 bg-paper/70 p-3 text-sm text-ink/85 dark:border-linen/15 dark:bg-bark-soft/60 dark:text-linen/85"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="flex-1 leading-relaxed">{ai.summary}</p>
              <button
                type="button"
                onClick={ai.dismissSummary}
                aria-label="Dismiss summary"
                className="-mt-0.5 rounded-full p-1 text-ink/60 transition-colors hover:bg-ink/10 dark:text-linen/60 dark:hover:bg-linen/10"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={ai.insertSummary}
                className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-cream transition-colors hover:bg-ink-soft"
              >
                Insert
              </button>
            </div>
          </div>
        )}

        <label htmlFor="editor-content" className="sr-only">
          Note content
        </label>
        <textarea
          id="editor-content"
          value={content}
          onChange={(e) => {
            const value = e.target.value;
            setContent(value);
            // Merge onto the authoritative snapshot so a stale title from this
            // render closure can't overwrite a sibling field.
            const snapshot = latestRef.current;
            scheduleSave({
              title: snapshot.title,
              content: value,
              category: snapshot.category,
            });
          }}
          placeholder="Pour your heart out..."
          className="mt-5 w-full flex-1 resize-none bg-transparent text-base leading-relaxed text-ink-soft placeholder:text-ink/35 focus:outline-none"
        />

        {voice.interim && (
          <p
            aria-live="polite"
            className="pointer-events-none absolute bottom-20 right-5 max-w-[60%] truncate text-right text-sm italic text-ink/50 sm:bottom-24 sm:right-7"
          >
            {voice.interim}
          </p>
        )}

        {voice.transcribing && (
          <p
            aria-live="polite"
            className="pointer-events-none absolute bottom-20 right-5 text-right text-sm italic text-ink/50 sm:bottom-24 sm:right-7"
          >
            Transcribing…
          </p>
        )}

        {voice.error && (
          <p
            role="status"
            className="pointer-events-none absolute bottom-20 right-5 max-w-[70%] text-right text-sm text-red-600 sm:bottom-24 sm:right-7 dark:text-red-400"
          >
            {voice.error}
          </p>
        )}

        {saveError && (
          <p
            role="alert"
            className="absolute bottom-20 left-5 max-w-[70%] text-left text-sm text-red-600 sm:bottom-24 sm:left-7 dark:text-red-400"
          >
            {saveError}
          </p>
        )}

        {voice.recording && (
          <p
            aria-hidden="true"
            className="pointer-events-none absolute bottom-[4.25rem] right-5 select-none text-right text-xs italic text-ink/45 sm:bottom-[5.25rem] sm:right-7"
          >
            Say &ldquo;close my note&rdquo; to finish
          </p>
        )}

        <div className="absolute bottom-5 right-5 flex items-center gap-2 sm:bottom-7 sm:right-7">
          {voice.recording ? (
            // Active-recording "pill" widget (Figma Voice state): mic, animated
            // waveform, green live dot, red stop, and the listen/headphones icon.
            <div className="flex items-center gap-3 rounded-full bg-bark px-4 py-2.5 text-linen shadow-lg dark:bg-[#1f1810]">
              <Mic className="h-4 w-4" aria-hidden="true" />
              <span
                aria-hidden="true"
                className="flex h-5 items-center gap-[3px]"
              >
                {[0, 0.15, 0.3, 0.45, 0.2].map((delay, i) => (
                  <span
                    key={i}
                    className="dictation-bar w-[3px] rounded-full bg-linen"
                    style={{ height: "100%", animationDelay: `${delay}s` }}
                  />
                ))}
              </span>
              <span
                aria-hidden="true"
                className="dictation-dot h-2 w-2 rounded-full bg-green-400"
              />
              <button
                type="button"
                onClick={voice.toggle}
                aria-label="Stop dictation"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white transition-colors hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-300"
              >
                <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              </button>
              {readAloud.available && (
                <button
                  type="button"
                  onClick={readAloud.toggle}
                  disabled={!readAloud.hasReadableContent}
                  aria-disabled={!readAloud.hasReadableContent}
                  aria-label={
                    readAloud.loading
                      ? "Loading audio"
                      : readAloud.speaking
                        ? "Stop reading"
                        : "Read note aloud"
                  }
                  aria-busy={readAloud.loading}
                  aria-pressed={readAloud.speaking || readAloud.loading}
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-linen transition-colors hover:bg-linen/15 focus:outline-none focus:ring-2 focus:ring-linen/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent ${
                    readAloud.speaking || readAloud.loading ? "bg-linen/20" : ""
                  } ${readAloud.loading ? "animate-pulse" : ""}`}
                >
                  <Headphones className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          ) : (
            <>
              {voice.micAvailable && (
                <button
                  type="button"
                  onClick={voice.toggle}
                  aria-label="Dictate note"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-cream shadow-md transition-colors hover:bg-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/40"
                >
                  <Mic className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
              {readAloud.available && (
                <button
                  type="button"
                  onClick={readAloud.toggle}
                  disabled={!readAloud.hasReadableContent}
                  aria-disabled={!readAloud.hasReadableContent}
                  aria-label={
                    readAloud.loading
                      ? "Loading audio"
                      : readAloud.speaking
                        ? "Stop reading"
                        : "Read note aloud"
                  }
                  aria-busy={readAloud.loading}
                  aria-pressed={readAloud.speaking || readAloud.loading}
                  className={`flex h-10 w-10 items-center justify-center rounded-full bg-ink text-cream shadow-md transition-colors hover:bg-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-ink ${
                    readAloud.loading ? "animate-pulse" : ""
                  }`}
                >
                  <Headphones className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {forming && (
        <FormingCard
          title={forming.title}
          color={forming.color}
          category={forming.category}
          naming={formingNaming}
          settling={formingSettle}
        />
      )}

      {categoryModalOpen && (
        <CategoryCreateModal
          onClose={() => setCategoryModalOpen(false)}
          onCreated={(created) => {
            // Select the new (private) category for this note and persist it,
            // merging onto the authoritative snapshot like every other write.
            setPickedCategory(created);
            const snapshot = latestRef.current;
            scheduleSave({
              title: snapshot.title,
              content: snapshot.content,
              category: created,
            });
            setCategoryModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * "Card being created" overlay shown on close (voice OR X). A centered card
 * assembles itself — tinted with the note's category color, serif title — over
 * a soft scrim, holds a beat, then settles into the board as `onClose()` runs.
 * While an untitled note is being named by AI, a subtle "✨ Creating your card…"
 * line shows until the title materializes in its place. Reduced motion degrades
 * to a plain fade (see `.forming-*` rules in globals.css) but title + text
 * still show.
 */
function FormingCard({
  title,
  color,
  category,
  naming,
  settling,
}: {
  title: string;
  color: string | undefined;
  category: string | undefined;
  naming: boolean;
  settling: boolean;
}) {
  const palette = categoryPalette(color);
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Creating your card"
      className={`pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-cream/55 backdrop-blur-[2px] dark:bg-bark/55 ${
        settling ? "forming-scrim-out" : "forming-scrim-in"
      }`}
    >
      <div
        style={{ backgroundColor: palette.bg, borderColor: palette.border }}
        className={`tinted flex h-64 w-72 flex-col overflow-hidden rounded-xl border p-5 shadow-xl ${
          settling ? "forming-card-settle" : "forming-card-in"
        }`}
      >
        <p className="text-xs font-bold text-ink/80">
          {category ?? "New note"}
        </p>

        {naming ? (
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm italic text-ink/70">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Creating your card…
          </p>
        ) : (
          <h3 className="turbo-materialize mt-3 line-clamp-3 break-words font-serif text-xl font-bold leading-snug text-ink">
            {title}
          </h3>
        )}

        {/* Soft "assembling" shimmer lines that fill the card body. */}
        <div className="mt-4 flex-1 space-y-2" aria-hidden="true">
          <span className="forming-shimmer block h-2.5 w-5/6 rounded-full bg-ink/10" />
          <span className="forming-shimmer block h-2.5 w-2/3 rounded-full bg-ink/10" />
          <span className="forming-shimmer block h-2.5 w-3/4 rounded-full bg-ink/10" />
        </div>
      </div>
    </div>
  );
}
