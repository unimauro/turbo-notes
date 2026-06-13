"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  clearTokens,
  getAccessToken,
  setTokens,
  subscribeTokens,
} from "@/lib/tokens";
import type { TokenPair } from "@/types/note";

interface AuthContextValue {
  /** False during SSR/hydration; true once client storage is readable. */
  ready: boolean;
  isAuthenticated: boolean;
  login: (tokens: TokenPair) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const emptySubscribe = () => () => {};

export function AuthProvider({ children }: { children: ReactNode }) {
  // Standard "is hydrated" store: false on the server, true on the client.
  const ready = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  // Token presence observed straight from the token store — no effects.
  const isAuthenticated = useSyncExternalStore(
    subscribeTokens,
    () => Boolean(getAccessToken()),
    () => false,
  );

  const login = useCallback((tokens: TokenPair) => setTokens(tokens), []);
  const logout = useCallback(() => clearTokens(), []);

  const value = useMemo(
    () => ({ ready, isAuthenticated, login, logout }),
    [ready, isAuthenticated, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
