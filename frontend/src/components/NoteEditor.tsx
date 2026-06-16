"use client";

import {
  Check,
  ChevronDown,
  Headphones,
  Loader2,
  Mic,
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

import { useDictation } from "@/hooks/useDictation";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useCreateNote, useUpdateNote } from "@/hooks/useNotes";
import { useWhisperRecorder } from "@/hooks/useWhisperRecorder";
import { categoryPalette } from "@/lib/colors";
import { loadVoices, pickVoice, speakWithBrowser } from "@/lib/speech";
import { formatEditorTimestamp } from "@/lib/time";
import { stripTurboClose } from "@/lib/voiceCommand";
import { assist, getAssistEnabled } from "@/services/assist";
import type { ListNotesParams } from "@/services/notes";
import { getTranscriptionEnabled } from "@/services/transcription";
import { getTtsEnabled, speak } from "@/services/tts";
import type { Category, CategoryRef, Note, NoteInput } from "@/types/note";

export const AUTOSAVE_DELAY_MS = 800;

// How long the gentle close (X / Escape) exit animation runs before the overlay
// unmounts. Mirrors the `.editor-exit` keyframe duration in globals.css.
export const EDITOR_EXIT_MS = 280;

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

  // ---- "Turbo close" hands-free command -----------------------------------
  // Set when the AI-generated title is applied so the heading plays a one-shot
  // "materialize" animation, and when the whole overlay is "evaporating" out.
  const [titleMaterializing, setTitleMaterializing] = useState(false);
  const [evaporating, setEvaporating] = useState(false);
  // True while the hands-free flow is awaiting the AI title, so we can show a
  // subtle "✨ Naming your note…" indicator until the title arrives.
  const [namingTitle, setNamingTitle] = useState(false);
  // Set while the gentle exit animation plays for a normal close (X / Escape),
  // just before we call onClose() and the parent unmounts the overlay.
  const [exiting, setExiting] = useState(false);

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

  // Guards the hands-free "Turbo close" sequence so a second match (or a stray
  // final transcript) can't re-trigger it. Lets appendDictation (declared before
  // turboClose) reach the latest sequence fn without re-subscribing handlers.
  const turboClosingRef = useRef(false);
  const turboCloseRef = useRef<(() => void) | null>(null);
  // Set by the real-time command listener (useWhisperRecorder.onCommand) the
  // instant the finish phrase is heard. It stops the Whisper recorder, whose
  // transcript then flows through appendDictation as usual — but Whisper may
  // transcribe the spoken command differently, so this flag forces the close
  // sequence after that transcript is appended regardless of whether the regex
  // matched the Whisper text. Cleared whenever the close actually fires.
  const pendingFinishRef = useRef(false);

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
    if (ok) {
      setSaveError(null);
      // Play the gentle exit animation, THEN unmount. We keep closingRef held
      // through the animation so a second X/Escape can't double-trigger.
      setExiting(true);
      await new Promise((resolve) => setTimeout(resolve, EDITOR_EXIT_MS));
      closingRef.current = false;
      onClose();
    } else {
      closingRef.current = false;
      // Keep the editor open so the user can retry; their text is still here.
      // (Flush failed — do NOT animate or close: no data loss.)
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

  // There's nothing to read aloud when both title and content are blank/
  // whitespace — disable the listen button in that case.
  const hasReadableContent =
    title.trim().length > 0 || content.trim().length > 0;

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
      // Hands-free "Turbo close": if the spoken transcript contains the command
      // phrase, strip it out (so the literal words never land in the note),
      // append any remaining real text, then trigger the close sequence.
      const { cleaned, triggered } = stripTurboClose(text);
      const append = triggered ? cleaned : text;

      if (append) {
        const snapshot = latestRef.current;
        const current = snapshot.content;
        const sep = current.length === 0 || /\s$/.test(current) ? "" : " ";
        const next = current + sep + append;
        setContent(next);
        scheduleSave({
          title: snapshot.title,
          content: next,
          category: snapshot.category,
        });
      }
      // A working append means any prior transcribe error is stale; clear it.
      setTranscribeError(null);

      // Fire the close sequence when EITHER the transcript itself contained the
      // command, OR the real-time listener already heard it (pendingFinishRef)
      // and stopped recording — in which case Whisper's text may not contain
      // the exact words, so we close regardless. Guard so it fires only once.
      if (
        (triggered || pendingFinishRef.current) &&
        !turboClosingRef.current
      ) {
        turboClosingRef.current = true;
        pendingFinishRef.current = false;
        turboCloseRef.current?.();
      }
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

  // Lets the real-time command handler stop the recorder without referencing
  // `whisper.stop` before `whisper` is declared. Written in an effect below.
  const whisperStopRef = useRef<(() => void) | null>(null);

  // Real-time hands-free finish: fired by the parallel SpeechRecognition the
  // instant the command is heard (see useWhisperRecorder). We stop the Whisper
  // recorder — its normal pipeline (upload -> transcript -> appendDictation)
  // then strips the command words and runs the close — and set pendingFinishRef
  // so the close fires even if Whisper's transcript doesn't contain the exact
  // words. A short safety-net timer guarantees the close even if Whisper yields
  // no transcript at all (empty clip / transcription failure).
  const handleWhisperCommand = useCallback(() => {
    if (turboClosingRef.current || pendingFinishRef.current) return;
    pendingFinishRef.current = true;
    whisperStopRef.current?.();
    setTimeout(() => {
      if (pendingFinishRef.current && !turboClosingRef.current) {
        turboClosingRef.current = true;
        pendingFinishRef.current = false;
        turboCloseRef.current?.();
      }
    }, 4000);
  }, []);

  const whisper = useWhisperRecorder({
    onTranscript: appendDictation,
    onError: handleWhisperError,
    onCommand: handleWhisperCommand,
  });

  // Expose whisper.stop to handleWhisperCommand (declared before `whisper`).
  const whisperStopFn = whisper.stop;
  useEffect(() => {
    whisperStopRef.current = whisperStopFn;
  }, [whisperStopFn]);

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

  // ---- AI assist (suggest a title / summarize) ----------------------------
  // Preferred path only (no free fallback like dictation/TTS have): when the
  // backend reports `enabled: false` (no API key) the buttons are simply hidden.
  // We decide availability ONCE on open (GET /assist/).
  const [assistEnabled, setAssistEnabled] = useState(false);
  // Independent loading flags so one action's spinner doesn't disable the other.
  const [titleLoading, setTitleLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);
  // The summary is shown non-destructively in a dismissible inline card.
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAssistEnabled()
      .then((enabled) => {
        if (!cancelled) setAssistEnabled(enabled);
      })
      .catch(() => {
        if (!cancelled) setAssistEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // There's only something worth assisting once the note body has real text:
  // both "suggest title" and "summarize" act on the content, so an empty/
  // whitespace-only body disables them.
  const assistHasText = content.trim().length > 0;

  // "Suggest title": send title+content (or just content), set the title field
  // through the same latestRef + scheduleSave path the other handlers use so it
  // autosaves and isn't clobbered by a concurrent dictation/field write.
  function handleSuggestTitle() {
    const text = noteText();
    if (!text || titleLoading) return;
    setAssistError(null);
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
      .catch(() => setAssistError("Couldn't suggest a title. Please try again."))
      .finally(() => setTitleLoading(false));
  }

  // "Summarize": show the summary in a dismissible card (non-destructive).
  function handleSummarize() {
    const text = noteText();
    if (!text || summaryLoading) return;
    setAssistError(null);
    setSummaryLoading(true);
    assist(text, "summary")
      .then((result) => setSummary(result.trim() || null))
      .catch(() => setAssistError("Couldn't summarize. Please try again."))
      .finally(() => setSummaryLoading(false));
  }

  // Prepend "Summary: <text>" to the note content, via latestRef + scheduleSave.
  function insertSummary() {
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
  }

  // ---- "Turbo close" sequence ---------------------------------------------
  // Triggered hands-free from the dictation/Whisper transcript (see
  // appendDictation). Stops capture, optionally generates a title with AI,
  // plays the title-materialize + overlay-evaporation animations, flushes, and
  // closes. Resilient end-to-end: a failing assist or flush never leaves the
  // editor stuck — we always evaporate and call onClose().
  const turboClose = useCallback(async () => {
    // Silence every capture/playback path before doing anything else.
    whisperStop();
    dictationStop();
    stopPlaybackRef.current?.();
    setSpeaking(false);
    setSpeakLoading(false);

    // (2) Generate a title with AI only when the title is empty and assist is on.
    let titleAppeared = false;
    const snapshot = latestRef.current;
    if (!snapshot.title.trim() && assistEnabled) {
      const body = snapshot.content.trim();
      if (body) {
        // Show the "✨ Naming your note…" indicator while the AI is working.
        setNamingTitle(true);
        try {
          const suggestion = (await assist(body, "title")).trim();
          if (suggestion) {
            setTitle(suggestion);
            // Persist via the same latestRef + scheduleSave path used elsewhere.
            const latest = latestRef.current;
            scheduleSave({
              title: suggestion,
              content: latest.content,
              category: latest.category,
            });
            // (3) Play the one-shot title "materialize" animation.
            setTitleMaterializing(true);
            titleAppeared = true;
          }
        } catch {
          // Never block closing on an assist failure.
        } finally {
          // The indicator's job is done the moment we have (or fail to get) a
          // title — the title itself now materializes in its place.
          setNamingTitle(false);
        }
      }
    }

    // (4) Hold so the user sees the title materialize before the editor leaves.
    // Give the freshly-named title a longer beat (matches the materialize
    // keyframe + a gentle pause); otherwise a short beat is enough.
    await new Promise((resolve) => setTimeout(resolve, titleAppeared ? 1100 : 500));
    setEvaporating(true);
    await new Promise((resolve) => setTimeout(resolve, 520));
    try {
      await flush();
    } catch {
      // Hands-free convenience: close regardless.
    }
    onClose();
  }, [
    whisperStop,
    dictationStop,
    assistEnabled,
    scheduleSave,
    flush,
    onClose,
  ]);

  // Expose the latest turboClose to appendDictation (declared earlier). Written
  // in an effect only (never during render) per this file's ref-write rule.
  useEffect(() => {
    turboCloseRef.current = () => {
      void turboClose();
    };
  }, [turboClose]);

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
      className={`fixed inset-0 z-40 flex flex-col bg-cream px-4 py-4 sm:px-8 sm:py-6 dark:bg-bark ${
        evaporating
          ? "turbo-evaporate"
          : exiting
            ? "editor-exit"
            : "editor-enter"
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
          className={`mt-3 w-full bg-transparent font-serif text-3xl font-bold text-ink placeholder:text-ink/40 focus:outline-none ${
            titleMaterializing ? "turbo-materialize" : ""
          }`}
        />

        {namingTitle && (
          <p
            role="status"
            aria-live="polite"
            className="mt-2 inline-flex items-center gap-1.5 text-sm italic text-ink/60 dark:text-linen/60"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Naming your note…
          </p>
        )}

        {assistEnabled && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSuggestTitle}
              disabled={!assistHasText || titleLoading}
              aria-busy={titleLoading}
              aria-label="Suggest a title"
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-paper/60 px-3 py-1.5 text-xs font-semibold text-ink/80 transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50 dark:border-linen/15 dark:bg-bark-soft/50 dark:text-linen/80 dark:hover:bg-bark-soft"
            >
              {titleLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Suggest title
            </button>
            <button
              type="button"
              onClick={handleSummarize}
              disabled={!assistHasText || summaryLoading}
              aria-busy={summaryLoading}
              aria-label="Summarize note"
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-paper/60 px-3 py-1.5 text-xs font-semibold text-ink/80 transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50 dark:border-linen/15 dark:bg-bark-soft/50 dark:text-linen/80 dark:hover:bg-bark-soft"
            >
              {summaryLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Text className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Summarize
            </button>
            {assistError && (
              <span role="status" className="text-xs text-red-600 dark:text-red-400">
                {assistError}
              </span>
            )}
          </div>
        )}

        {summary && (
          <div
            role="status"
            className="mt-3 rounded-xl border border-ink/15 bg-paper/70 p-3 text-sm text-ink/85 dark:border-linen/15 dark:bg-bark-soft/60 dark:text-linen/85"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="flex-1 leading-relaxed">{summary}</p>
              <button
                type="button"
                onClick={() => setSummary(null)}
                aria-label="Dismiss summary"
                className="-mt-0.5 rounded-full p-1 text-ink/60 transition-colors hover:bg-ink/10 dark:text-linen/60 dark:hover:bg-linen/10"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={insertSummary}
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

        {recording && (
          <p
            aria-hidden="true"
            className="pointer-events-none absolute bottom-[4.25rem] right-5 select-none text-right text-xs italic text-ink/45 sm:bottom-[5.25rem] sm:right-7"
          >
            Say &ldquo;close my note&rdquo; to finish
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
                  disabled={!hasReadableContent}
                  aria-disabled={!hasReadableContent}
                  aria-label={
                    speakLoading
                      ? "Loading audio"
                      : speaking
                        ? "Stop reading"
                        : "Read note aloud"
                  }
                  aria-busy={speakLoading}
                  aria-pressed={speaking || speakLoading}
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-linen transition-colors hover:bg-linen/15 focus:outline-none focus:ring-2 focus:ring-linen/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent ${
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
                  disabled={!hasReadableContent}
                  aria-disabled={!hasReadableContent}
                  aria-label={
                    speakLoading
                      ? "Loading audio"
                      : speaking
                        ? "Stop reading"
                        : "Read note aloud"
                  }
                  aria-busy={speakLoading}
                  aria-pressed={speaking || speakLoading}
                  className={`flex h-10 w-10 items-center justify-center rounded-full bg-ink text-cream shadow-md transition-colors hover:bg-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-ink ${
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
