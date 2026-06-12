import { QueryClient } from "@tanstack/react-query";

/**
 * Factory (rather than a module-level singleton) so each browser session —
 * and each test — gets a fresh client, avoiding state leaking across
 * React strict-mode remounts and test cases.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}
