/**
 * Service-layer tests for the AI text-to-speech client. The shared api instance
 * is mocked; we assert the request shape and response unwrapping.
 */
jest.mock("@/services/api", () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

import { api } from "@/services/api";
import { getTtsEnabled, speak } from "@/services/tts";

const mockApi = api as jest.Mocked<typeof api>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getTtsEnabled", () => {
  it("GETs /speak/ and returns the enabled flag and voice", async () => {
    mockApi.get.mockResolvedValueOnce({ data: { enabled: true, voice: "nova" } });
    await expect(getTtsEnabled()).resolves.toEqual({
      enabled: true,
      voice: "nova",
    });
    expect(mockApi.get).toHaveBeenCalledWith("/speak/");
  });

  it("coerces a missing flag/voice to false/empty", async () => {
    mockApi.get.mockResolvedValueOnce({ data: {} });
    await expect(getTtsEnabled()).resolves.toEqual({
      enabled: false,
      voice: "",
    });
  });
});

describe("speak", () => {
  it("POSTs the text as a blob request and returns the audio Blob", async () => {
    const blob = new Blob(["audio"], { type: "audio/mpeg" });
    mockApi.post.mockResolvedValueOnce({ data: blob });

    const result = await speak("hello world");

    expect(result).toBe(blob);
    const [url, body, config] = mockApi.post.mock.calls[0];
    expect(url).toBe("/speak/");
    expect(body).toEqual({ text: "hello world" });
    expect(config).toEqual({ responseType: "blob" });
  });

  it("includes the voice override when provided", async () => {
    const blob = new Blob(["audio"], { type: "audio/mpeg" });
    mockApi.post.mockResolvedValueOnce({ data: blob });

    await speak("hi", "shimmer");

    const [, body] = mockApi.post.mock.calls[0];
    expect(body).toEqual({ text: "hi", voice: "shimmer" });
  });
});
