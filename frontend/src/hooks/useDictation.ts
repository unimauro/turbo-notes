import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice dictation via the free, key-less Web Speech API
 * (`SpeechRecognition` / `webkitSpeechRecognition`).
 *
 * - `supported` is true only when the browser exposes the constructor. jsdom
 *   (and Firefox) do not, so callers can hide the mic button accordingly.
 * - Final transcript chunks are delivered to `onFinalTranscript`; interim
 *   (still-being-recognised) text is surfaced via the `interim` state for a
 *   subtle live preview. The hook never touches note state directly.
 * - The recognition instance is fully cleaned up on unmount and whenever the
 *   caller stops it, and `onerror`/`onend` reset `listening` back to false.
 */
export interface UseDictationOptions {
  /** Called with each finalised transcript segment (already trimmed of nothing). */
  onFinalTranscript: (text: string) => void;
}

export interface UseDictation {
  supported: boolean;
  listening: boolean;
  /** Latest interim (non-final) transcript, for a live preview. Empty when idle. */
  interim: string;
  start: () => void;
  stop: () => void;
}

function getRecognitionCtor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export function useDictation({
  onFinalTranscript,
}: UseDictationOptions): UseDictation {
  const supported = getRecognitionCtor() !== undefined;
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // Keep the latest callback without re-subscribing recognition handlers.
  const onFinalRef = useRef(onFinalTranscript);
  useEffect(() => {
    onFinalRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  const teardown = useCallback(() => {
    const rec = recognitionRef.current;
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
      recognitionRef.current = null;
    }
    setInterim("");
  }, []);

  const stop = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        // ignore
      }
    }
    teardown();
    setListening(false);
  }, [teardown]);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || recognitionRef.current) return;

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang =
      (typeof navigator !== "undefined" && navigator.language) || "en-US";

    rec.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }
      const trimmedFinal = finalText.trim();
      if (trimmedFinal) onFinalRef.current(trimmedFinal);
      setInterim(interimText);
    };

    rec.onerror = () => {
      teardown();
      setListening(false);
    };

    rec.onend = () => {
      // Fires on normal stop and on some errors; ensure state is reset.
      teardown();
      setListening(false);
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      teardown();
      setListening(false);
    }
  }, [teardown]);

  // Clean up if the component unmounts mid-recognition.
  useEffect(() => teardown, [teardown]);

  return { supported, listening, interim, start, stop };
}
