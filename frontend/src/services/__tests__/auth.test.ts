jest.mock("@/services/api", () => ({
  api: { post: jest.fn() },
}));

import { api } from "@/services/api";
import {
  obtainToken,
  refreshToken,
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
  it("POSTs credentials to /auth/token/ and returns the token pair", async () => {
    const tokens = { access: "acc", refresh: "ref" };
    mockApi.post.mockResolvedValueOnce({ data: tokens });

    const result = await obtainToken("a@b.co", "hunter22pass");

    expect(mockApi.post).toHaveBeenCalledWith("/auth/token/", {
      email: "a@b.co",
      password: "hunter22pass",
    });
    expect(result).toEqual(tokens);
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

describe("refreshToken", () => {
  it("POSTs the refresh token to /auth/token/refresh/", async () => {
    mockApi.post.mockResolvedValueOnce({ data: { access: "fresh" } });

    const result = await refreshToken("ref");

    expect(mockApi.post).toHaveBeenCalledWith("/auth/token/refresh/", {
      refresh: "ref",
    });
    expect(result).toEqual({ access: "fresh" });
  });
});
