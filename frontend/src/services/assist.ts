import { api } from "@/services/api";

/**
 * AI "assist" service (suggest a title, summarize a note). Talks to the backend
 * `/assist/` endpoint, which proxies an OpenAI-compatible chat provider. When
 * the backend reports `enabled: false` (no API key configured) the UI hides the
 * assist affordances entirely.
 */

export type AssistAction = "title" | "summary";

/** GET /assist/ — is server-side AI assist available? */
export async function getAssistEnabled(): Promise<boolean> {
  const { data } = await api.get<{ enabled: boolean }>("/assist/");
  return Boolean(data?.enabled);
}

/**
 * POST /assist/ — run an assist `action` ("title"/"summary") over `text` and
 * return the resulting suggestion string.
 */
export async function assist(
  text: string,
  action: AssistAction,
): Promise<string> {
  const { data } = await api.post<{ result: string }>("/assist/", {
    text,
    action,
  });
  return data?.result ?? "";
}
