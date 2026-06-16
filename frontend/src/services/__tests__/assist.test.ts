/**
 * Service-layer tests for the AI "assist" client. The shared api instance is
 * mocked; we assert the request shape and response unwrapping.
 */
jest.mock("@/services/api", () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

import { api } from "@/services/api";
import { assist, getAssistEnabled } from "@/services/assist";

const mockApi = api as jest.Mocked<typeof api>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getAssistEnabled", () => {
  it("GETs /assist/ and returns the enabled flag", async () => {
    mockApi.get.mockResolvedValueOnce({ data: { enabled: true } });
    await expect(getAssistEnabled()).resolves.toBe(true);
    expect(mockApi.get).toHaveBeenCalledWith("/assist/");
  });

  it("coerces a missing flag to false", async () => {
    mockApi.get.mockResolvedValueOnce({ data: {} });
    await expect(getAssistEnabled()).resolves.toBe(false);
  });
});

describe("assist", () => {
  it("POSTs the text + action and returns the result string", async () => {
    mockApi.post.mockResolvedValueOnce({ data: { result: "A Title" } });

    const result = await assist("note body", "title");

    expect(result).toBe("A Title");
    expect(mockApi.post).toHaveBeenCalledWith("/assist/", {
      text: "note body",
      action: "title",
    });
  });

  it("returns an empty string when no result is present", async () => {
    mockApi.post.mockResolvedValueOnce({ data: {} });
    await expect(assist("x", "summary")).resolves.toBe("");
  });
});
