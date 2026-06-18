import { useCallback, useEffect, useRef, useState } from "react";

import { loadVoices, pickVoice, speakWithBrowser } from "@/lib/speech";
import { getTtsEnabled, speak } from "@/services/tts";

interface UseReadAloudArgs {
  /** Builds the text to read aloud (title + content). Empty ⇒ nothing to read. */
  noteText: () => string;
}

export interface UseReadAloud {
  /** True while audio (server TTS or browser voice) is playing. */
  speaking: boolean;
  /** True while the server TTS mp3 is being fetched (before playback starts). */
  loading: boolean;
  /** The headphones button shows when EITHER path (server TTS or browser) is available. */
  available: boolean;
  /** False when there's nothing to read (blank title + content) ⇒ disable the button. */
  hasReadableContent: boolean;
  /** Toggle read-aloud: start (preferring server TTS), or stop if already playing. */
  toggle: () => void;
  /** Hard stop: halt any audio/synthesis and reset state. Safe to call anytime. */
  stop: () => void;
}

/**
 * "Listen" / read-note-aloud, extracted from NoteEditor. Preferred path:
 * server-side OpenAI TTS (a soft, natural voice) — fetch an mp3 blob and play
 * it. Fallback: the browser's Web Speech synthesis, but with a hand-picked good
 * English voice (see lib/speech) instead of the default robotic one. Availability
 * is resolved ONCE on open (GET /speak/); on any TTS failure we fall back to the
 * browser voice. `stop()` is exposed so the editor's close paths can silence
 * playback before unmounting.
 */
export function useReadAloud({ noteText }: UseReadAloudArgs): UseReadAloud {
  const speechSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsVoice, setTtsVoice] = useState("");
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  // The currently-playing <audio> element + its object URL, so a second click
  // (or close/unmount) can stop playback and free the blob URL.
  const audioRef = useRef<{ el: HTMLAudioElement; url: string } | null>(null);

  const available = ttsEnabled || speechSupported;
  const hasReadableContent = noteText().length > 0;

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

  // Stop any in-flight audio/speech when the editor unmounts (no setState here).
  useEffect(() => {
    return () => {
      stopAudio();
      if (speechSupported) window.speechSynthesis?.cancel();
    };
  }, [speechSupported, stopAudio]);

  // Full stop, callable from event handlers / the editor's close paths: halts
  // playback/synthesis AND resets the speaking/loading state.
  const stop = useCallback(() => {
    stopAudio();
    if (speechSupported) window.speechSynthesis?.cancel();
    setSpeaking(false);
    setLoading(false);
  }, [speechSupported, stopAudio]);

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

  const toggle = useCallback(() => {
    // A second click (while speaking/loading) always stops everything.
    if (speaking || loading) {
      stop();
      return;
    }

    const text = noteText();
    if (!text) return;

    // Prefer server-side OpenAI TTS; fall back to the browser on any failure.
    if (ttsEnabled) {
      setLoading(true);
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
          setLoading(false);
          setSpeaking(true);
          // play() may reject (e.g. autoplay policy); fall back if it does.
          void el.play().catch(() => {
            stopAudio();
            void speakWithBrowserVoice(text);
          });
        })
        .catch(() => {
          // TTS request failed — fall back to the browser voice.
          setLoading(false);
          setSpeaking(true);
          void speakWithBrowserVoice(text);
        });
      return;
    }

    setSpeaking(true);
    void speakWithBrowserVoice(text);
  }, [speaking, loading, stop, noteText, ttsEnabled, ttsVoice, stopAudio, speakWithBrowserVoice]);

  return { speaking, loading, available, hasReadableContent, toggle, stop };
}
