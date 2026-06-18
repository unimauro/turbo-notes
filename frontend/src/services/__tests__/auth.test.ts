jest.mock("@/services/api", () => ({
  api: { post: jest.fn() },
}));

import { api } from "@/services/api";
import {
  logout,
  obtainToken,
  refreshSession,
  register,
  resetPassword,
} from "@/services/auth";

const mockApi = api as jest.Mocked<typeof api>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("register", () => {
  it("POSTs email + password to /auth/register/ and returns the user", async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: 1, email: "a@b.co" } });

    const result = await register("a@b.co", "hunter22pass");

    expect(mockApi.post).toHaveBeenCalledWith("/auth/register/", {
      email: "a@b.co",
      password: "hunter22pass",
    });
    expect(result).toEqual({ id: 1, email: "a@b.co" });
  });
});

describe("obtainToken", () => {
  it("POSTs credentials to /auth/token/ (tokens land in httpOnly cookies)", async () => {
    mockApi.post.mockResolvedValueOnce({ data: { detail: "Signed in." } });

    await obtainToken("a@b.co", "hunter22pass");

    expect(mockApi.post).toHaveBeenCalledWith("/auth/token/", {
      email: "a@b.co",
      password: "hunter22pass",
    });
  });
});

describe("resetPassword", () => {
  it("POSTs email + new password to /auth/password-reset/", async () => {
    mockApi.post.mockResolvedValueOnce({ data: { detail: "ok" } });

    await resetPassword("a@b.co", "fresh22pass");

    expect(mockApi.post).toHaveBeenCalledWith("/auth/password-reset/", {
      email: "a@b.co",
      password: "fresh22pass",
    });
  });
});

describe("refreshSession", () => {
  it("POSTs an empty body to /auth/token/refresh/ (refresh rides in the cookie)", async () => {
    mockApi.post.mockResolvedValueOnce({ data: { detail: "Refreshed." } });

    await refreshSession();

    expect(mockApi.post).toHaveBeenCalledWith("/auth/token/refresh/", {});
  });
});

describe("logout", () => {
  it("POSTs to /auth/logout/ to clear the cookies server-side", async () => {
    mockApi.post.mockResolvedValueOnce({ data: null });

    await logout();

    expect(mockApi.post).toHaveBeenCalledWith("/auth/logout/", {});
  });
});
