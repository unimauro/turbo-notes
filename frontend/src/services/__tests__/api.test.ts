/**
 * Interceptor tests: the axios module is mocked (callable instance + root post
 * for the bare refresh call) while AxiosError stays real so the instanceof
 * check in handleResponseError behaves like production. Auth is cookie-based, so
 * there are no tokens to read — the refresh call just relies on withCredentials.
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

import { api, API_BASE_URL, handleResponseError } from "@/services/api";

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
  // Keep redirectToLogin from triggering jsdom navigation noise.
  window.history.pushState(null, "", "/login");
});

describe("handleResponseError", () => {
  it("rethrows non-401 errors untouched", async () => {
    const error = new Error("boom");

    await expect(handleResponseError(error)).rejects.toBe(error);
    expect(rootPost).not.toHaveBeenCalled();
  });

  it("refreshes once on 401 (cookie-based) and replays the original request", async () => {
    rootPost.mockResolvedValueOnce({ data: {} });
    apiCallable.mockResolvedValueOnce({ data: "replayed" });

    const error = make401("/notes/");
    const result = await handleResponseError(error);

    expect(rootPost).toHaveBeenCalledWith(
      `${API_BASE_URL}/auth/token/refresh/`,
      {},
      expect.objectContaining({ withCredentials: true }),
    );
    expect(apiCallable).toHaveBeenCalledWith(error.config);
    expect(result).toEqual({ data: "replayed" });
  });

  it("runs only ONE refresh for concurrent 401s and replays both", async () => {
    let resolveRefresh: (v: { data: unknown }) => void = () => {};
    rootPost.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    apiCallable
      .mockResolvedValueOnce({ data: "replay-A" })
      .mockResolvedValueOnce({ data: "replay-B" });

    const pA = handleResponseError(make401("/notes/"));
    const pB = handleResponseError(make401("/categories/"));

    await Promise.resolve();
    resolveRefresh({ data: {} });

    const [rA, rB] = await Promise.all([pA, pB]);

    expect(rootPost).toHaveBeenCalledTimes(1);
    expect(rA).toEqual({ data: "replay-A" });
    expect(rB).toEqual({ data: "replay-B" });
  });

  it("allows a fresh refresh on a later 401 (in-flight promise resets)", async () => {
    rootPost.mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce({ data: {} });
    apiCallable.mockResolvedValue({ data: "ok" });

    await handleResponseError(make401("/notes/"));
    await handleResponseError(make401("/notes/"));

    expect(rootPost).toHaveBeenCalledTimes(2);
  });

  it("does not retry a request that was already retried", async () => {
    const error = make401("/notes/");
    (error.config as InternalAxiosRequestConfig & { _retried?: boolean })._retried = true;

    await expect(handleResponseError(error)).rejects.toBe(error);
    expect(rootPost).not.toHaveBeenCalled();
  });

  it("does not refresh on auth endpoints (login/refresh/logout)", async () => {
    await expect(handleResponseError(make401("/auth/token/"))).rejects.toBeInstanceOf(
      AxiosError,
    );
    expect(rootPost).not.toHaveBeenCalled();
  });

  it("rethrows (and redirects) when the refresh itself fails", async () => {
    rootPost.mockRejectedValueOnce(new Error("refresh dead"));

    await expect(handleResponseError(make401("/notes/"))).rejects.toBeInstanceOf(
      AxiosError,
    );
    expect(rootPost).toHaveBeenCalledTimes(1);
  });
});
