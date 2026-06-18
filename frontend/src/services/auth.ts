import { api } from "@/services/api";
import type { Me, RegisteredUser } from "@/types/note";

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

/**
 * POST /auth/token/ — sign in. The server sets the access + refresh tokens as
 * httpOnly cookies; the SPA never reads them (no JS-readable token storage), so
 * this resolves to void. The request must send/receive cookies (api uses
 * withCredentials).
 */
export async function obtainToken(email: string, password: string): Promise<void> {
  await api.post("/auth/token/", { email, password });
}

/**
 * POST /auth/token/refresh/ — mint a fresh access cookie. The refresh token
 * travels as an httpOnly cookie, so there's nothing to pass.
 */
export async function refreshSession(): Promise<void> {
  await api.post("/auth/token/refresh/", {});
}

/** POST /auth/logout/ — clear the auth cookies server-side. */
export async function logout(): Promise<void> {
  await api.post("/auth/logout/", {});
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

/** GET /auth/me/ — the authenticated user ({ id, email }); 401 when anonymous. */
export async function getMe(): Promise<Me> {
  const { data } = await api.get<Me>("/auth/me/");
  return data;
}
