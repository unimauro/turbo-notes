"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getMe, logout as logoutRequest } from "@/services/auth";

type Status = "loading" | "authed" | "anon";

interface AuthContextValue {
  /** False until the initial session check resolves. */
  ready: boolean;
  isAuthenticated: boolean;
  /** Mark the session active — call AFTER the token endpoint set the cookies. */
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const queryClient = useQueryClient();

  // Auth lives in an httpOnly cookie we can't read from JS, so we can't know the
  // session synchronously. On mount we probe it: GET /auth/me/ → 200 means
  // authed, 401 means anon. (A stale access token is refreshed transparently by
  // the axios interceptor before this resolves.)
  useEffect(() => {
    let cancelled = false;
    // Only resolve the *initial* probe — never clobber an explicit login/logout
    // that may have happened while this request was in flight.
    const settle = (next: Status) =>
      setStatus((prev) => (!cancelled && prev === "loading" ? next : prev));
    getMe()
      .then(() => settle("authed"))
      .catch(() => settle("anon"));
    return () => {
      cancelled = true;
    };
  }, []);

  // Cookies are already set by the token endpoint; flip state and wipe any
  // cached data so one account's notes can never flash into another's session.
  const login = useCallback(() => {
    queryClient.clear();
    setStatus("authed");
  }, [queryClient]);

  const logout = useCallback(() => {
    setStatus("anon");
    queryClient.clear();
    // Best-effort cookie clear server-side; the UI doesn't wait on it.
    void logoutRequest().catch(() => {});
  }, [queryClient]);

  const value = useMemo(
    () => ({
      ready: status !== "loading",
      isAuthenticated: status === "authed",
      login,
      logout,
    }),
    [status, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
