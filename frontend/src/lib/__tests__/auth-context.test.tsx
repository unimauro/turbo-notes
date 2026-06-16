import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

import { AuthProvider, useAuth } from "@/lib/auth-context";
import { clearTokens } from "@/lib/tokens";

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  };
}

describe("auth cache isolation", () => {
  afterEach(() => clearTokens());

  it("clears the query cache on logout so notes can't leak between users", () => {
    const client = new QueryClient();
    client.setQueryData(["notes"], { results: [{ id: 1, title: "private" }] });
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapperFor(client),
    });

    act(() => result.current.logout());

    expect(client.getQueryData(["notes"])).toBeUndefined();
  });

  it("clears the query cache on login so a new user never sees the previous one's data", () => {
    const client = new QueryClient();
    client.setQueryData(["notes"], { results: [{ id: 1, title: "private" }] });
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapperFor(client),
    });

    act(() => result.current.login({ access: "a", refresh: "r" }));

    expect(client.getQueryData(["notes"])).toBeUndefined();
  });
});
