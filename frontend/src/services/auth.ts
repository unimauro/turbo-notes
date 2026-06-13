import { api } from "@/services/api";
import type { RegisteredUser, TokenPair } from "@/types/note";

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

/** POST /auth/token/refresh/ */
export async function refreshToken(
  refresh: string,
): Promise<{ access: string }> {
  const { data } = await api.post<{ access: string }>("/auth/token/refresh/", {
    refresh,
  });
  return data;
}
