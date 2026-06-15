import { api } from "@/services/api";

/**
 * AI text-to-speech ("read note aloud") service. Talks to the backend
 * `/speak/` endpoint, which proxies an OpenAI-compatible TTS provider and
 * returns MP3 audio. When the backend reports `enabled: false` (no API key
 * configured) the UI falls back to the browser's free Web Speech synthesis.
 */

export interface TtsStatus {
  enabled: boolean;
  /** The server's configured default voice (e.g. "nova"). */
  voice: string;
}

/** GET /speak/ — is server-side TTS available, and what's the default voice? */
export async function getTtsEnabled(): Promise<TtsStatus> {
  const { data } = await api.get<Partial<TtsStatus>>("/speak/");
  return {
    enabled: Boolean(data?.enabled),
    voice: typeof data?.voice === "string" ? data.voice : "",
  };
}

/**
 * POST /speak/ — synthesize `text` to speech and return the MP3 audio Blob.
 * An optional `voice` overrides the server default (must be a valid OpenAI
 * voice or the backend responds 400).
 */
export async function speak(text: string, voice?: string): Promise<Blob> {
  const body: { text: string; voice?: string } = { text };
  if (voice) body.voice = voice;
  const { data } = await api.post<Blob>("/speak/", body, {
    responseType: "blob",
  });
  return data;
}
