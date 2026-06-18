import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

jest.mock("@/services/auth", () => ({
  getMe: jest.fn(),
  logout: jest.fn().mockResolvedValue(undefined),
}));

import { AuthProvider, useAuth } from "@/lib/auth-context";
import { getMe, logout } from "@/services/auth";

const getMeMock = getMe as jest.Mock;
const logoutMock = logout as jest.Mock;

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  logoutMock.mockResolvedValue(undefined);
});

describe("session probe on mount", () => {
  it("becomes authenticated when /auth/me/ resolves", async () => {
    getMeMock.mockResolvedValueOnce({ id: 1, email: "a@b.co" });
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapperFor(new QueryClient()),
    });

    // Loading until the probe settles.
    expect(result.current.ready).toBe(false);
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("becomes anonymous when /auth/me/ rejects (401)", async () => {
    getMeMock.mockRejectedValueOnce(new Error("401"));
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapperFor(new QueryClient()),
    });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.isAuthenticated).toBe(false);
  });
});

describe("auth cache isolation", () => {
  it("clears the query cache on logout and calls the logout endpoint", async () => {
    getMeMock.mockResolvedValueOnce({ id: 1, email: "a@b.co" });
    const client = new QueryClient();
    client.setQueryData(["notes"], { results: [{ id: 1, title: "private" }] });
    const { result } = renderHook(() => useAuth(), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => result.current.logout());

    expect(client.getQueryData(["notes"])).toBeUndefined();
    expect(result.current.isAuthenticated).toBe(false);
    expect(logoutMock).toHaveBeenCalled();
  });

  it("clears the query cache on login so a new user never sees the previous one's data", async () => {
    getMeMock.mockRejectedValueOnce(new Error("401"));
    const client = new QueryClient();
    client.setQueryData(["notes"], { results: [{ id: 1, title: "private" }] });
    const { result } = renderHook(() => useAuth(), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => result.current.login());

    expect(client.getQueryData(["notes"])).toBeUndefined();
    expect(result.current.isAuthenticated).toBe(true);
  });
});
