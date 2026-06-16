"use client";

import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth-context";
import { getMe } from "@/services/auth";

export const meKeys = {
  all: ["me"] as const,
};

/**
 * The current authenticated user ({ id, email }). Only runs once a token is
 * present; the ["me"] cache is wiped by queryClient.clear() on logout.
 */
export function useMe() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: meKeys.all,
    queryFn: getMe,
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });
}
