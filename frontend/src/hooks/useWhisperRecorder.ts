import { useCallback, useEffect, useRef, useState } from "react";

import { transcribeAudio } from "@/services/transcription";

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

export function useWhisperRecorder({
  onTranscript,
  onError,
}: UseWhisperRecorderOptions): UseWhisperRecorder {
  const supported = isSupported();
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Keep the latest callbacks without re-creating start/stop.
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

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
          releaseStream();
          recorderRef.current = null;
          setListening(false);
          fail("Recording failed. Try again.");
        };

        recorder.onstop = () => {
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
        setListening(true);
      })
      .catch(() => {
        releaseStream();
        recorderRef.current = null;
        fail("Microphone access denied.");
      });
  }, [supported, releaseStream, fail]);

  const stop = useCallback(() => {
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
  }, [releaseStream]);

  // Clean up the stream/recorder if the component unmounts mid-recording.
  useEffect(
    () => () => {
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
    [],
  );

  return { supported, listening, transcribing, error, start, stop };
}
