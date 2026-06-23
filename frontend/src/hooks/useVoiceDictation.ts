import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { useDictation } from "@/hooks/useDictation";
import { useWhisperRecorder } from "@/hooks/useWhisperRecorder";
import { parseChangeCategory, stripTurboClose } from "@/lib/voiceCommand";
import { getTranscriptionEnabled } from "@/services/transcription";
import type { CategoryRef } from "@/types/note";

/** The autosave snapshot the editor treats as authoritative. */
type Snapshot = {
  title: string;
  content: string;
  category: CategoryRef | undefined;
};

interface UseVoiceDictationArgs {
  /** Authoritative autosave snapshot — appends merge onto it, never the stale closure. */
  latestRef: RefObject<Snapshot>;
  scheduleSave: (snapshot: Snapshot) => void;
  setContent: (value: string) => void;
  /** The shared forming-card close finale; the hands-free "turbo close" hands off to it. */
  playFormingCard: (nameTitle?: () => Promise<string>) => Promise<void>;
  /** Builds the best-effort AI title closure (or undefined when assist is off). */
  buildNameTitle: () => (() => Promise<string>) | undefined;
  /** Silences any read-aloud playback (turbo close stops everything first). */
  stopReadAloud: () => void;
  /**
   * Handle a spoken "change category to X" candidate. The editor resolves it
   * against its categories and, on a match, switches the note's category (a
   * side effect) and returns the leftover dictation; returns null when no known
   * category matched (so the words are dictated literally instead).
   */
  onCategoryCommand?: (candidate: string) => { rest: string } | null;
}

export interface UseVoiceDictation {
  /** True while either capture mode is actively listening. */
  recording: boolean;
  /** True when either Whisper-record or Web Speech dictation is available. */
  micAvailable: boolean;
  /** True while a Whisper clip is being transcribed server-side. */
  transcribing: boolean;
  /** Interim (non-final) Web-Speech transcript to show while listening; "" otherwise. */
  interim: string;
  /** A transcribe error to surface (only set when no Web-Speech fallback exists). */
  error: string | null;
  /** Toggle capture on/off (Whisper when enabled, else Web Speech). */
  toggle: () => void;
  /** Stop whichever capture mode is active — used by the editor's close/Escape paths. */
  stop: () => void;
}

/**
 * Voice dictation pipeline, extracted from NoteEditor: free Web Speech dictation
 * with a server-side Whisper upgrade, plus the hands-free "turbo close" command.
 * Availability is resolved once on open (GET /transcribe/); any Whisper failure
 * falls back to Web Speech. Final transcripts append onto the autosave snapshot
 * (latestRef) — never a stale render closure — and the editor's state syncs from
 * that authoritative value.
 *
 * The "turbo close" race handling (a delayed Whisper transcript arriving after
 * the close was triggered) lives here, fully owned by the hook; it hands off to
 * the editor's shared forming-card finale via `playFormingCard`.
 */
export function useVoiceDictation({
  latestRef,
  scheduleSave,
  setContent,
  playFormingCard,
  buildNameTitle,
  stopReadAloud,
  onCategoryCommand,
}: UseVoiceDictationArgs): UseVoiceDictation {
  // Guards the hands-free "Turbo close" sequence so a second match (or a stray
  // final transcript) can't re-trigger it.
  const turboClosingRef = useRef(false);
  const turboCloseRef = useRef<(() => void) | null>(null);
  // Set by the real-time command listener the instant the finish phrase is heard.
  // Forces the close after the transcript is appended regardless of whether the
  // regex matched the (possibly different) Whisper text. Cleared when close fires.
  const pendingFinishRef = useRef(false);
  // Bridges "finish phrase heard" → "Whisper transcript appended". Whisper is
  // batch: the transcript arrives (via appendDictation) only AFTER we stop the
  // recorder. turboClose awaits this before reading latestRef.content for title-
  // gen, so the title comes from the FINAL dictated text, not a racing timer.
  const pendingTranscriptRef = useRef<{
    promise: Promise<void>;
    resolve: () => void;
  } | null>(null);

  const [whisperEnabled, setWhisperEnabled] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  // Final transcript chunks append to content with sensible spacing, then go to
  // autosave. We append onto latestRef (the snapshot), not the `content` state,
  // so concurrent recognition callbacks never clobber each other with a stale
  // closure; React state is synced from that authoritative value.
  const appendDictation = useCallback(
    (text: string) => {
      // Append a chunk of text onto the authoritative snapshot (never a stale
      // closure) with sensible spacing, then schedule the autosave. Reads
      // latestRef AFTER any category switch so it persists the new category.
      const appendText = (chunk: string) => {
        if (!chunk) return;
        const snapshot = latestRef.current;
        const sep =
          snapshot.content.length === 0 || /\s$/.test(snapshot.content) ? "" : " ";
        const next = snapshot.content + sep + chunk;
        setContent(next);
        scheduleSave({
          title: snapshot.title,
          content: next,
          category: snapshot.category,
        });
      };

      const releasePending = () => {
        // The (possibly delayed) Whisper transcript has now landed in latestRef.
        if (pendingTranscriptRef.current) {
          pendingTranscriptRef.current.resolve();
          pendingTranscriptRef.current = null;
        }
      };

      // (1) Hands-free "change category to X": switch the category and keep
      // dictating the rest. Only when a KNOWN category matches; otherwise the
      // words fall through and are dictated literally.
      const change = parseChangeCategory(text);
      if (change.triggered && onCategoryCommand) {
        const result = onCategoryCommand(change.candidate);
        if (result) {
          appendText([change.before, result.rest].filter(Boolean).join(" ").trim());
          setTranscribeError(null);
          releasePending();
          return;
        }
      }

      // (2) Hands-free "Turbo close": strip the command phrase out (so the
      // literal words never land in the note), append any remaining text, close.
      const { cleaned, triggered } = stripTurboClose(text);
      appendText(triggered ? cleaned : text);
      // A working append means any prior transcribe error is stale; clear it.
      setTranscribeError(null);
      releasePending();

      // Fire the close when EITHER the transcript contained the command, OR the
      // real-time listener already heard it (pendingFinishRef). Guard: once only.
      if ((triggered || pendingFinishRef.current) && !turboClosingRef.current) {
        turboClosingRef.current = true;
        pendingFinishRef.current = false;
        turboCloseRef.current?.();
      }
    },
    [latestRef, scheduleSave, setContent, onCategoryCommand],
  );

  const dictation = useDictation({ onFinalTranscript: appendDictation });

  // Records mic audio and transcribes it server-side. Availability is resolved
  // once on open; on failure or unsupported, we use free Web Speech dictation.
  const dictationSupported = dictation.supported;
  const dictationStart = dictation.start;
  const handleWhisperError = useCallback(
    (message: string) => {
      // Fall back to Web Speech if supported. Flipping whisperEnabled off keeps
      // every whisperEnabled-gated branch on the dictation path so they stay in
      // sync with the actual capture mode.
      if (dictationSupported) {
        setWhisperEnabled(false);
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

  // Real-time hands-free finish: fired the instant the command is heard. We stop
  // the Whisper recorder — its pipeline (upload → transcript → appendDictation)
  // strips the command words and runs the close — and arm a pendingTranscript
  // promise that turboClose awaits (up to its 8s cap) so a long note's title is
  // generated from the FINAL transcript. The 4s timer is a last-resort that just
  // STARTS the close if appendDictation never fires (it does NOT resolve the
  // promise), so turboClose still awaits the real transcript when it lands.
  const handleWhisperCommand = useCallback(() => {
    if (turboClosingRef.current || pendingFinishRef.current) return;
    pendingFinishRef.current = true;
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    pendingTranscriptRef.current = { promise, resolve };
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

  const recording = whisperEnabled ? whisper.listening : dictation.listening;
  const micAvailable = whisperEnabled || dictation.supported;

  const whisperStop = whisper.stop;
  const dictationStop = dictation.stop;
  // Stop whichever capture mode is active. Stopping the inactive one is a no-op,
  // so calling both is safe and keeps the editor's close/Escape paths simple.
  const stop = useCallback(() => {
    whisperStop();
    dictationStop();
  }, [whisperStop, dictationStop]);

  const toggle = useCallback(() => {
    setTranscribeError(null);
    if (whisperEnabled) {
      if (whisper.listening) whisper.stop();
      else whisper.start();
      return;
    }
    if (dictation.listening) dictation.stop();
    else dictation.start();
  }, [whisperEnabled, whisper, dictation]);

  // ---- "Turbo close" sequence (voice) -------------------------------------
  // Stops capture + read-aloud, AWAITS the pending Whisper transcript (so the
  // title is generated from the final dictated content, not a racing timer),
  // then plays the forming-card finale. Resilient: a failing assist, missing
  // content, or a transcript timeout never leaves the editor stuck.
  const turboClose = useCallback(async () => {
    whisperStop();
    dictationStop();
    stopReadAloud();

    const pending = pendingTranscriptRef.current?.promise;
    if (pending) {
      await Promise.race([
        pending,
        new Promise<void>((resolve) => setTimeout(resolve, 8000)),
      ]);
    }

    await playFormingCard(buildNameTitle());
  }, [whisperStop, dictationStop, stopReadAloud, playFormingCard, buildNameTitle]);

  // Expose the latest turboClose to appendDictation. Effect-only ref write.
  useEffect(() => {
    turboCloseRef.current = () => {
      void turboClose();
    };
  }, [turboClose]);

  const interim = !whisperEnabled && dictation.listening ? dictation.interim : "";

  return {
    recording,
    micAvailable,
    transcribing: whisper.transcribing,
    interim,
    error: transcribeError,
    toggle,
    stop,
  };
}
