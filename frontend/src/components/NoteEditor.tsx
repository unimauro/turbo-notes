"use client";

import { Check, ChevronDown, Headphones, Mic, Square, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { useDictation } from "@/hooks/useDictation";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useCreateNote, useUpdateNote } from "@/hooks/useNotes";
import { useWhisperRecorder } from "@/hooks/useWhisperRecorder";
import { categoryPalette } from "@/lib/colors";
import { loadVoices, pickVoice, speakWithBrowser } from "@/lib/speech";
import { formatEditorTimestamp } from "@/lib/time";
import type { ListNotesParams } from "@/services/notes";
import { getTranscriptionEnabled } from "@/services/transcription";
import { getTtsEnabled, speak } from "@/services/tts";
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
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(
    note?.updated_at ?? null,
  );
  const [openedAt] = useState(() => new Date().toISOString());
  const [speaking, setSpeaking] = useState(false);
  // Surfaced when the final flush on close fails; we keep the editor open so the
  // user doesn't lose their last edit.
  const [saveError, setSaveError] = useState<string | null>(null);

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
    dictationStopRef.current?.(); // end any in-flight recognition first
    stopPlaybackRef.current?.(); // and any in-flight read-aloud playback
    let ok = false;
    try {
      // Await the final flush: if the last save rejects we must NOT unmount, or
      // the pending edit is lost silently.
      ok = await flush();
    } catch {
      ok = false;
    }
    closingRef.current = false;
    if (ok) {
      setSaveError(null);
      onClose();
    } else {
      // Keep the editor open so the user can retry; their text is still here.
      setSaveError("Couldn't save your changes. Please try again.");
    }
  }

  // Lets handleClose() (declared before the speak logic) stop read-aloud audio.
  const stopPlaybackRef = useRef<(() => void) | null>(null);

  // Lets handleClose() (declared before useDictation) reach the latest stop fn.
  const dictationStopRef = useRef<(() => void) | null>(null);

  // ---- "Listen" (read note aloud) -----------------------------------------
  // Preferred path: server-side OpenAI TTS (soft, natural voice) — fetch an mp3
  // blob and play it. Fallback: the browser's Web Speech synthesis, but with a
  // GOOD English voice (see lib/speech) instead of the default robotic one. We
  // decide ONCE on open whether TTS is available (GET /speak/).
  const speechSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsVoice, setTtsVoice] = useState("");
  const [speakLoading, setSpeakLoading] = useState(false);

  // Holds the currently-playing <audio> element + its object URL so a second
  // click (or close/unmount) can stop playback and free the blob URL.
  const audioRef = useRef<{ el: HTMLAudioElement; url: string } | null>(null);

  // The headphones button shows when EITHER path is available.
  const listenAvailable = ttsEnabled || speechSupported;

  // Resolve TTS availability once on open.
  useEffect(() => {
    let cancelled = false;
    getTtsEnabled()
      .then(({ enabled, voice }) => {
        if (cancelled) return;
        setTtsEnabled(enabled);
        setTtsVoice(voice);
      })
      .catch(() => {
        if (!cancelled) setTtsEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.el.pause();
      URL.revokeObjectURL(audioRef.current.url);
      audioRef.current = null;
    }
  }, []);

  // Stop any in-flight speech/audio when the editor unmounts.
  useEffect(() => {
    return () => {
      stopAudio();
      if (speechSupported) window.speechSynthesis?.cancel();
    };
  }, [speechSupported, stopAudio]);

  // Expose a stop fn to handleClose (declared earlier). Written in an effect
  // only (never during render) per this file's ref-write rule.
  useEffect(() => {
    stopPlaybackRef.current = () => {
      stopAudio();
      if (speechSupported) window.speechSynthesis?.cancel();
    };
  }, [speechSupported, stopAudio]);

  const noteText = useCallback(
    () => [title, content].filter(Boolean).join("\n").trim(),
    [title, content],
  );

  // Fallback: read aloud with a hand-picked natural browser voice.
  const speakWithBrowserVoice = useCallback(
    async (text: string) => {
      if (!speechSupported) {
        setSpeaking(false);
        return;
      }
      const synth = window.speechSynthesis;
      synth.cancel(); // clear any queued utterance from a prior note
      const voices = await loadVoices(synth);
      const utterance = speakWithBrowser(synth, text, pickVoice(voices));
      // Watchdog: if no voice resolves, onstart/onend/onerror may never fire and
      // the headphones button stays stuck in "speaking". Bail out after 2s.
      const g = setTimeout(() => setSpeaking(false), 2000);
      utterance.onstart = () => clearTimeout(g);
      utterance.onend = () => {
        clearTimeout(g);
        setSpeaking(false);
      };
      utterance.onerror = () => {
        clearTimeout(g);
        setSpeaking(false);
      };
    },
    [speechSupported],
  );

  function toggleSpeak() {
    // A second click (while speaking/loading) always stops everything.
    if (speaking || speakLoading) {
      stopAudio();
      if (speechSupported) window.speechSynthesis?.cancel();
      setSpeaking(false);
      setSpeakLoading(false);
      return;
    }

    const text = noteText();
    if (!text) return;

    // Prefer server-side OpenAI TTS; fall back to the browser on any failure.
    if (ttsEnabled) {
      setSpeakLoading(true);
      speak(text, ttsVoice || undefined)
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          const el = new Audio(url);
          audioRef.current = { el, url };
          el.onended = () => {
            stopAudio();
            setSpeaking(false);
          };
          el.onerror = () => {
            stopAudio();
            setSpeaking(false);
          };
          setSpeakLoading(false);
          setSpeaking(true);
          // play() may reject (e.g. autoplay policy); fall back if it does.
          void el.play().catch(() => {
            stopAudio();
            void speakWithBrowserVoice(text);
          });
        })
        .catch(() => {
          // TTS request failed — fall back to the browser voice.
          setSpeakLoading(false);
          setSpeaking(true);
          void speakWithBrowserVoice(text);
        });
      return;
    }

    setSpeaking(true);
    void speakWithBrowserVoice(text);
  }

  // ---- AI transcription state (declared early so dictation handlers can clear
  // a stale error and flip the capture mode). ------------------------------
  const [whisperEnabled, setWhisperEnabled] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  // ---- Voice dictation (Web Speech API — free, no keys/backend) -----------
  // Final transcript chunks are appended to the note's content with sensible
  // spacing, then handed to the existing autosave via scheduleSave. We append
  // onto latestRef (the autosave snapshot) rather than the `content` state so
  // concurrent recognition callbacks never clobber each other with a stale
  // closure; React state is then synced from that authoritative value.
  const appendDictation = useCallback(
    (text: string) => {
      const snapshot = latestRef.current;
      const current = snapshot.content;
      const sep = current.length === 0 || /\s$/.test(current) ? "" : " ";
      const next = current + sep + text;
      setContent(next);
      // A working append means any prior transcribe error is stale; clear it.
      setTranscribeError(null);
      scheduleSave({
        title: snapshot.title,
        content: next,
        category: snapshot.category,
      });
    },
    [scheduleSave],
  );

  const dictation = useDictation({ onFinalTranscript: appendDictation });

  // ---- AI transcription (Whisper) -----------------------------------------
  // Records mic audio and transcribes it server-side. We decide ONCE when the
  // editor opens whether Whisper is available (GET /transcribe/). If the check
  // fails or it's disabled/unsupported, we use the free Web Speech dictation
  // above. On any Whisper failure mid-use we also fall back to Web Speech.
  const dictationSupported = dictation.supported;
  const dictationStart = dictation.start;
  const handleWhisperError = useCallback(
    (message: string) => {
      // Fall back to Web Speech dictation if the browser supports it. Flipping
      // whisperEnabled off keeps every whisperEnabled-gated branch (recording,
      // micAvailable, toggleDictation, Escape) on the dictation path so they
      // stay in sync with the actual capture mode.
      if (dictationSupported) {
        setWhisperEnabled(false);
        // The fallback is working now, so don't leave a stale error lingering.
        setTranscribeError(null);
        dictationStart();
      } else {
        setTranscribeError(message);
      }
    },
    [dictationSupported, dictationStart],
  );

  const whisper = useWhisperRecorder({
    onTranscript: appendDictation,
    onError: handleWhisperError,
  });

  // Resolve availability once on open; default to Web Speech if the check fails
  // or if the browser can't record (MediaRecorder unsupported).
  useEffect(() => {
    let cancelled = false;
    getTranscriptionEnabled()
      .then((enabled) => {
        if (!cancelled) setWhisperEnabled(enabled && whisper.supported);
      })
      .catch(() => {
        if (!cancelled) setWhisperEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [whisper.supported]);

  // The "recording pill" shows for either capture mode; a mic button shows when
  // either Whisper-record or Web Speech dictation is available.
  const recording = whisperEnabled ? whisper.listening : dictation.listening;
  const micAvailable = whisperEnabled || dictation.supported;

  // Refs are written in effects only (never during render) per this file's rule.
  const whisperStop = whisper.stop;
  const dictationStop = dictation.stop;
  useEffect(() => {
    dictationStopRef.current = () => {
      whisperStop();
      dictationStop();
    };
  }, [whisperStop, dictationStop]);

  function toggleDictation() {
    setTranscribeError(null);
    if (whisperEnabled) {
      if (whisper.listening) whisper.stop();
      else whisper.start();
      return;
    }
    if (dictation.listening) dictation.stop();
    else dictation.start();
  }

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
    } else if (recording) {
      // Stop whichever capture mode is active (Whisper or Web Speech) first.
      if (whisperEnabled) whisper.stop();
      else dictation.stop();
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
      className="fixed inset-0 z-40 flex flex-col bg-cream px-4 py-4 sm:px-8 sm:py-6 dark:bg-bark"
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

        {!whisperEnabled && dictation.listening && dictation.interim && (
          <p
            aria-live="polite"
            className="pointer-events-none absolute bottom-20 right-5 max-w-[60%] truncate text-right text-sm italic text-ink/50 sm:bottom-24 sm:right-7"
          >
            {dictation.interim}
          </p>
        )}

        {whisper.transcribing && (
          <p
            aria-live="polite"
            className="pointer-events-none absolute bottom-20 right-5 text-right text-sm italic text-ink/50 sm:bottom-24 sm:right-7"
          >
            Transcribing…
          </p>
        )}

        {transcribeError && (
          <p
            role="status"
            className="pointer-events-none absolute bottom-20 right-5 max-w-[70%] text-right text-sm text-red-600 sm:bottom-24 sm:right-7 dark:text-red-400"
          >
            {transcribeError}
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

        <div className="absolute bottom-5 right-5 flex items-center gap-2 sm:bottom-7 sm:right-7">
          {recording ? (
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
                onClick={toggleDictation}
                aria-label="Stop dictation"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white transition-colors hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-300"
              >
                <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              </button>
              {listenAvailable && (
                <button
                  type="button"
                  onClick={toggleSpeak}
                  aria-label={
                    speakLoading
                      ? "Loading audio"
                      : speaking
                        ? "Stop reading"
                        : "Read note aloud"
                  }
                  aria-busy={speakLoading}
                  aria-pressed={speaking || speakLoading}
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-linen transition-colors hover:bg-linen/15 focus:outline-none focus:ring-2 focus:ring-linen/40 ${
                    speaking || speakLoading ? "bg-linen/20" : ""
                  } ${speakLoading ? "animate-pulse" : ""}`}
                >
                  <Headphones className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          ) : (
            <>
              {micAvailable && (
                <button
                  type="button"
                  onClick={toggleDictation}
                  aria-label="Dictate note"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-cream shadow-md transition-colors hover:bg-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/40"
                >
                  <Mic className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
              {listenAvailable && (
                <button
                  type="button"
                  onClick={toggleSpeak}
                  aria-label={
                    speakLoading
                      ? "Loading audio"
                      : speaking
                        ? "Stop reading"
                        : "Read note aloud"
                  }
                  aria-busy={speakLoading}
                  aria-pressed={speaking || speakLoading}
                  className={`flex h-10 w-10 items-center justify-center rounded-full bg-ink text-cream shadow-md transition-colors hover:bg-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/40 ${
                    speakLoading ? "animate-pulse" : ""
                  }`}
                >
                  <Headphones className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
