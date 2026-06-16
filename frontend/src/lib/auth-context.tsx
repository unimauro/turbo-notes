"use client";

import { useQueryClient } from "@tanstack/react-query";
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

  const queryClient = useQueryClient();

  // Wipe cached data on every auth transition so one account's notes can never
  // flash into another's session (e.g. logging in as a different user). Without
  // this, TanStack Query's cache from the previous user shows for a beat before
  // the new fetch resolves.
  const login = useCallback(
    (tokens: TokenPair) => {
      queryClient.clear();
      setTokens(tokens);
    },
    [queryClient],
  );
  const logout = useCallback(() => {
    clearTokens();
    queryClient.clear();
  }, [queryClient]);

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
