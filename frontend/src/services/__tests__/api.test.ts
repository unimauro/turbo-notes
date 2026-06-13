/**
 * Interceptor tests: the axios module is mocked (callable instance + root
 * post for the bare refresh call) while AxiosError stays real so the
 * instanceof check in handleResponseError behaves like production.
 */
import type { InternalAxiosRequestConfig } from "axios";

jest.mock("axios", () => {
  const actual = jest.requireActual("axios");
  const instance = Object.assign(jest.fn(), {
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  });
  const root = Object.assign(jest.fn(), {
    create: jest.fn(() => instance),
    post: jest.fn(),
  });
  return { __esModule: true, default: root, AxiosError: actual.AxiosError };
});

import axios, { AxiosError } from "axios";

import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "@/lib/tokens";
import {
  api,
  API_BASE_URL,
  attachAuthHeader,
  handleResponseError,
} from "@/services/api";

const rootPost = axios.post as jest.Mock;
const apiCallable = api as unknown as jest.Mock;

function makeConfig(url: string): InternalAxiosRequestConfig {
  return { url, headers: {} } as unknown as InternalAxiosRequestConfig;
}

function make401(url: string): AxiosError {
  return new AxiosError(
    "Unauthorized",
    "ERR_BAD_REQUEST",
    makeConfig(url),
    {},
    { status: 401, statusText: "Unauthorized", headers: {}, config: makeConfig(url), data: {} },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  clearTokens();
  // Keep redirectToLogin from triggering jsdom navigation noise.
  window.history.pushState(null, "", "/login");
});

describe("attachAuthHeader", () => {
  it("adds a Bearer header when an access token is stored", () => {
    setTokens({ access: "acc-token", refresh: "ref-token" });

    const config = attachAuthHeader(makeConfig("/notes/"));

    expect(config.headers.Authorization).toBe("Bearer acc-token");
  });

  it("leaves the header off when no token is stored", () => {
    const config = attachAuthHeader(makeConfig("/notes/"));

    expect(config.headers.Authorization).toBeUndefined();
  });

  it("never decorates auth endpoints", () => {
    setTokens({ access: "acc-token", refresh: "ref-token" });

    const config = attachAuthHeader(makeConfig("/auth/token/"));

    expect(config.headers.Authorization).toBeUndefined();
  });
});

describe("handleResponseError", () => {
  it("rethrows non-401 errors untouched", async () => {
    const error = new Error("boom");

    await expect(handleResponseError(error)).rejects.toBe(error);
    expect(rootPost).not.toHaveBeenCalled();
  });

  it("refreshes once on 401 and replays the original request", async () => {
    setTokens({ access: "stale", refresh: "ref-token" });
    rootPost.mockResolvedValueOnce({ data: { access: "fresh" } });
    apiCallable.mockResolvedValueOnce({ data: "replayed" });

    const error = make401("/notes/");
    const result = await handleResponseError(error);

    expect(rootPost).toHaveBeenCalledWith(
      `${API_BASE_URL}/auth/token/refresh/`,
      { refresh: "ref-token" },
      expect.anything(),
    );
    expect(getAccessToken()).toBe("fresh");
    expect(error.config?.headers.Authorization).toBe("Bearer fresh");
    expect(apiCallable).toHaveBeenCalledWith(error.config);
    expect(result).toEqual({ data: "replayed" });
  });

  it("does not retry a request that was already retried", async () => {
    setTokens({ access: "stale", refresh: "ref-token" });

    const error = make401("/notes/");
    (error.config as InternalAxiosRequestConfig & { _retried?: boolean })._retried =
      true;

    await expect(handleResponseError(error)).rejects.toBe(error);
    expect(rootPost).not.toHaveBeenCalled();
  });

  it("clears tokens when the refresh itself fails", async () => {
    setTokens({ access: "stale", refresh: "ref-token" });
    rootPost.mockRejectedValueOnce(new Error("refresh dead"));

    await expect(handleResponseError(make401("/notes/"))).rejects.toBeInstanceOf(
      AxiosError,
    );
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it("clears tokens and rethrows when there is no refresh token", async () => {
    setTokens({ access: "stale", refresh: "" });
    clearTokens();

    await expect(handleResponseError(make401("/notes/"))).rejects.toBeInstanceOf(
      AxiosError,
    );
    expect(rootPost).not.toHaveBeenCalled();
    expect(getAccessToken()).toBeNull();
  });
});
