import { useCallback, useEffect, useRef, useState } from "react";

import { transcribeAudio } from "@/services/transcription";
import { matchesTurboClose } from "@/lib/voiceCommand";

/**
 * Browser audio recording for AI (Whisper) transcription.
 *
 * Records mic audio with `MediaRecorder`, and on stop uploads the recorded
 * blob to the backend `/transcribe/` endpoint, delivering the transcript via
 * `onTranscript`. Mirrors the shape of `useDictation` (supported/listening/
 * start/stop) so the editor can swap between them, and adds a `transcribing`
 * state for the brief upload phase plus an `error` string for inline messages.
 *
 * - `supported` is false in jsdom and any browser without MediaRecorder/
 *   getUserMedia, so callers can fall back to Web Speech dictation.
 * - All failures (permission denial, recorder error, upload error) surface via
 *   `onError` so the caller can fall back; `error` mirrors the latest message.
 */
export interface UseWhisperRecorderOptions {
  onTranscript: (text: string) => void;
  /** Called on any recording/transcription failure so the caller can fall back. */
  onError?: (message: string) => void;
  /**
   * Called (at most once per recording) the moment the real-time command
   * listener hears the hands-free finish phrase ("close my note"). Whisper's
   * own transcript is still the source of truth for the note text; this is just
   * an early signal so the editor can stop recording and close hands-free
   * without the user pressing stop. Only fires where browser SpeechRecognition
   * is available — see the unsupported fallback below.
   */
  onCommand?: () => void;
}

export interface UseWhisperRecorder {
  supported: boolean;
  /** True while actively capturing mic audio. */
  listening: boolean;
  /** True while the recorded clip is being uploaded/transcribed. */
  transcribing: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
}

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

/**
 * Constructor for the browser Web Speech API, used ONLY for the lightweight
 * real-time finish-command listener that runs alongside the Whisper recorder.
 * Undefined in jsdom, Firefox and Safari — callers then simply skip the
 * real-time listener (command is still caught once Whisper's transcript lands).
 */
function getRecognitionCtor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export function useWhisperRecorder({
  onTranscript,
  onError,
  onCommand,
}: UseWhisperRecorderOptions): UseWhisperRecorder {
  const supported = isSupported();
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // ---- Real-time finish-command listener (parallel SpeechRecognition) ------
  // While the Whisper MediaRecorder records, a separate SpeechRecognition runs
  // purely to detect the finish phrase the instant it's spoken. Its transcript
  // is NEVER used for the note — Whisper still produces the high-quality text.
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // Rolling transcript (interim + final) we test the command regex against.
  const commandTranscriptRef = useRef("");
  // Ensures onCommand fires at most once per recording, even if multiple
  // results match or onend/onerror fire spuriously afterward.
  const commandFiredRef = useRef(false);

  // Keep the latest callbacks without re-creating start/stop.
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  const onCommandRef = useRef(onCommand);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  // Tear down the real-time listener. Safe to call repeatedly / when idle and
  // never throws — SpeechRecognition can be in odd states.
  const stopCommandListener = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    commandTranscriptRef.current = "";
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.onstart = null;
      try {
        rec.abort();
      } catch {
        // ignore — already stopped/aborted
      }
    }
  }, []);

  // Start a lightweight SpeechRecognition alongside the recorder. Best-effort:
  // if unsupported or it throws, we silently do nothing and recording proceeds
  // exactly as before (command is then only caught via Whisper's transcript).
  const startCommandListener = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || recognitionRef.current) return;

    commandTranscriptRef.current = "";
    commandFiredRef.current = false;

    let rec: SpeechRecognition;
    try {
      rec = new Ctor();
    } catch {
      return;
    }
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang =
      (typeof navigator !== "undefined" && navigator.language) || "en-US";

    rec.onresult = (event) => {
      try {
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const transcript = event.results[i][0]?.transcript ?? "";
          commandTranscriptRef.current += ` ${transcript}`;
        }
        if (
          !commandFiredRef.current &&
          matchesTurboClose(commandTranscriptRef.current)
        ) {
          commandFiredRef.current = true;
          stopCommandListener();
          onCommandRef.current?.();
        }
      } catch {
        // Never let a recognition glitch break recording.
      }
    };

    // SpeechRecognition fires onerror/onend spuriously; just clean up the
    // listener. It must never throw or affect the Whisper recording/upload.
    rec.onerror = () => {
      stopCommandListener();
    };
    rec.onend = () => {
      stopCommandListener();
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      stopCommandListener();
    }
  }, [stopCommandListener]);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const fail = useCallback(
    (message: string) => {
      setError(message);
      onErrorRef.current?.(message);
    },
    [],
  );

  const start = useCallback(() => {
    if (!supported || recorderRef.current) return;
    setError(null);
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        streamRef.current = stream;
        chunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        recorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };

        recorder.onerror = () => {
          stopCommandListener();
          releaseStream();
          recorderRef.current = null;
          setListening(false);
          fail("Recording failed. Try again.");
        };

        recorder.onstop = () => {
          stopCommandListener();
          releaseStream();
          recorderRef.current = null;
          setListening(false);
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          chunksRef.current = [];
          if (blob.size === 0) return;
          setTranscribing(true);
          transcribeAudio(blob)
            .then((text) => {
              const trimmed = text.trim();
              if (trimmed) onTranscriptRef.current(trimmed);
            })
            .catch(() => {
              fail("Transcription failed. Try dictation instead.");
            })
            .finally(() => setTranscribing(false));
        };

        recorder.start();
        // Best-effort real-time finish-command listener alongside the recorder.
        startCommandListener();
        setListening(true);
      })
      .catch(() => {
        releaseStream();
        recorderRef.current = null;
        fail("Microphone access denied.");
      });
  }, [supported, releaseStream, fail, startCommandListener, stopCommandListener]);

  const stop = useCallback(() => {
    // Stop the real-time listener first; the recorder's onstop drives upload.
    stopCommandListener();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop(); // triggers onstop -> upload
      } catch {
        releaseStream();
        recorderRef.current = null;
        setListening(false);
      }
    }
  }, [releaseStream, stopCommandListener]);

  // Clean up the stream/recorder + listener if the component unmounts
  // mid-recording.
  useEffect(
    () => () => {
      stopCommandListener();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // ignore
        }
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [stopCommandListener],
  );

  return { supported, listening, transcribing, error, start, stop };
}
