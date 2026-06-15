import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
} from "@/lib/tokens";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

/**
 * Single axios instance for the whole app. The base URL is resolved at build
 * time from NEXT_PUBLIC_API_URL so the same code works locally and in Docker.
 */
export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

/** Auth endpoints must never trigger the refresh-and-retry dance. */
function isAuthUrl(url: string | undefined): boolean {
  return Boolean(url?.includes("/auth/"));
}

/** Request interceptor: attach the Bearer token when one is stored. */
export function attachAuthHeader(
  config: InternalAxiosRequestConfig,
): InternalAxiosRequestConfig {
  const token = getAccessToken();
  if (token && !isAuthUrl(config.url)) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

function redirectToLogin(): void {
  clearTokens();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

/**
 * A single, shared in-flight refresh promise. Concurrent 401s must NOT each
 * kick off their own token refresh; instead they all await this one promise and
 * replay once it settles. Reset to null on settle so a later 401 can refresh
 * again.
 */
let refreshInFlight: Promise<string> | null = null;

function refreshAccessToken(refresh: string): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = axios
      .post<{ access: string }>(
        `${API_BASE_URL}/auth/token/refresh/`,
        { refresh },
        { headers: { "Content-Type": "application/json" } },
      )
      .then(({ data }) => {
        setAccessToken(data.access);
        return data.access;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/**
 * Response interceptor: on 401, try ONE token refresh and replay the request.
 * If the refresh fails (or there is no refresh token), clear everything and
 * send the user back to the login screen.
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

  const refresh = getRefreshToken();
  if (!refresh) {
    redirectToLogin();
    throw error;
  }

  config._retried = true;
  try {
    // Bare axios call (must not run through these interceptors again), shared
    // across all concurrent 401s so at most one refresh runs at a time.
    const access = await refreshAccessToken(refresh);
    config.headers.Authorization = `Bearer ${access}`;
    return api(config);
  } catch {
    redirectToLogin();
    throw error;
  }
}

api.interceptors.request.use(attachAuthHeader);
api.interceptors.response.use((response) => response, handleResponseError);
