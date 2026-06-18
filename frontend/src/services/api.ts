import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

/**
 * Single axios instance for the whole app. Auth is carried by httpOnly cookies
 * (set by the backend on login/refresh), so every request must send them:
 * `withCredentials: true`. No token is ever read or attached in JS — that's the
 * whole point of the cookie approach (no XSS-readable token storage).
 */
export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

/**
 * Auth endpoints (login/register/refresh/logout) must never trigger the
 * refresh-and-retry dance. `/auth/me/` is intentionally NOT matched: it carries
 * the cookie and participates in the normal 401 refresh flow.
 */
function isAuthUrl(url: string | undefined): boolean {
  return Boolean(
    url?.includes("/auth/token") ||
      url?.includes("/auth/register") ||
      url?.includes("/auth/logout"),
  );
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

// Pages where a 401 is expected (the anonymous auth screens) — never bounce the
// user away from them. Elsewhere (e.g. the board after the session expires) a
// failed refresh sends them to login.
const AUTH_PATHS = new Set(["/login", "/signup", "/reset"]);

function redirectToLogin(): void {
  if (typeof window !== "undefined" && !AUTH_PATHS.has(window.location.pathname)) {
    window.location.assign("/login");
  }
}

/**
 * A single, shared in-flight refresh promise. Concurrent 401s must NOT each
 * kick off their own refresh; they all await this one and replay once it
 * settles. Reset to null on settle so a later 401 can refresh again. The
 * refresh token rides as an httpOnly cookie, so there's nothing to pass.
 */
let refreshInFlight: Promise<void> | null = null;

function refreshSession(): Promise<void> {
  if (!refreshInFlight) {
    refreshInFlight = axios
      .post(
        `${API_BASE_URL}/auth/token/refresh/`,
        {},
        { headers: { "Content-Type": "application/json" }, withCredentials: true },
      )
      .then(() => undefined)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/**
 * Response interceptor: on 401, try ONE cookie-based refresh and replay the
 * request. If the refresh fails, send the user back to the login screen.
 */
export async function handleResponseError(error: unknown): Promise<unknown> {
  if (!(error instanceof AxiosError) || error.response?.status !== 401) {
    throw error;
  }

  const config = error.config as RetriableConfig | undefined;
  if (!config || config._retried || isAuthUrl(config.url)) {
    if (config && !isAuthUrl(config.url)) redirectToLogin();
    throw error;
  }

  config._retried = true;
  try {
    // Bare axios call (must not run through these interceptors again), shared
    // across all concurrent 401s so at most one refresh runs at a time.
    await refreshSession();
    return api(config);
  } catch {
    redirectToLogin();
    throw error;
  }
}

api.interceptors.response.use((response) => response, handleResponseError);
