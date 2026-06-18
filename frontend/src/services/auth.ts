import { api } from "@/services/api";
import type { Me, RegisteredUser, TokenPair } from "@/types/note";

/** POST /auth/register/ — duplicate email surfaces as 400 {"email": [...]}. */
export async function register(
  email: string,
  password: string,
): Promise<RegisteredUser> {
  const { data } = await api.post<RegisteredUser>("/auth/register/", {
    email,
    password,
  });
  return data;
}

/** POST /auth/token/ — email-based simplejwt obtain. */
export async function obtainToken(
  email: string,
  password: string,
): Promise<TokenPair> {
  const { data } = await api.post<TokenPair>("/auth/token/", {
    email,
    password,
  });
  return data;
}

/**
 * POST /auth/password-reset/ — simple reset, no email round-trip.
 *
 * Always resolves 200 with a generic message (the API never reveals whether
 * the email exists), so the UI should just tell the user to try logging in.
 */
export async function resetPassword(
  email: string,
  password: string,
): Promise<void> {
  await api.post("/auth/password-reset/", { email, password });
}

/** POST /auth/token/refresh/ */
export async function refreshToken(
  refresh: string,
): Promise<{ access: string }> {
  const { data } = await api.post<{ access: string }>("/auth/token/refresh/", {
    refresh,
  });
  return data;
}

/** GET /auth/me/ — the authenticated user ({ id, email }). */
export async function getMe(): Promise<Me> {
  const { data } = await api.get<Me>("/auth/me/");
  return data;
}
