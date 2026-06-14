import { api } from "@/services/api";

/**
 * AI speech-to-text (Whisper) service. Talks to the backend `/transcribe/`
 * endpoint, which proxies an OpenAI-compatible provider. When the backend
 * reports `enabled: false` (no API key configured) the UI falls back to the
 * free in-browser Web Speech dictation instead.
 */

/** GET /transcribe/ — is server-side Whisper transcription available? */
export async function getTranscriptionEnabled(): Promise<boolean> {
  const { data } = await api.get<{ enabled: boolean }>("/transcribe/");
  return Boolean(data?.enabled);
}

/**
 * POST /transcribe/ — upload a recorded audio blob, get the transcript text.
 * The `Content-Type` is left to the browser so the multipart boundary is set.
 */
export async function transcribeAudio(blob: Blob): Promise<string> {
  const form = new FormData();
  const ext = blob.type.includes("ogg") ? "ogg" : "webm";
  form.append("audio", blob, `recording.${ext}`);
  const { data } = await api.post<{ text: string }>("/transcribe/", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data?.text ?? "";
}
