import type { TokenPair } from "@/types/note";

/**
 * JWT storage. localStorage is a deliberate tradeoff: simple, survives
 * reloads, works with a pure-API backend. The XSS-hardened alternative
 * (httpOnly cookies) is documented in the README.
 *
 * The module doubles as a tiny external store (subscribe/emit) so React can
 * observe auth changes via useSyncExternalStore without effect gymnastics.
 */
const ACCESS_KEY = "turbo-notes.access";
const REFRESH_KEY = "turbo-notes.refresh";

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

/** Notifies on every token change in this tab. Returns an unsubscribe fn. */
export function subscribeTokens(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode / quota — auth just won't persist across reloads.
  }
}

export function getAccessToken(): string | null {
  return safeGet(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return safeGet(REFRESH_KEY);
}

export function setTokens(tokens: TokenPair): void {
  safeSet(ACCESS_KEY, tokens.access);
  safeSet(REFRESH_KEY, tokens.refresh);
  emit();
}

export function setAccessToken(access: string): void {
  safeSet(ACCESS_KEY, access);
  emit();
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
  } catch {
    // Nothing to clear.
  }
  emit();
}
