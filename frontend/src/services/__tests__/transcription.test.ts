/**
 * Service-layer tests for the AI transcription client. The shared api instance
 * is mocked; we assert the request shape and response unwrapping.
 */
jest.mock("@/services/api", () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

import { api } from "@/services/api";
import {
  getTranscriptionEnabled,
  transcribeAudio,
} from "@/services/transcription";

const mockApi = api as jest.Mocked<typeof api>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getTranscriptionEnabled", () => {
  it("GETs /transcribe/ and returns the enabled flag", async () => {
    mockApi.get.mockResolvedValueOnce({ data: { enabled: true } });
    await expect(getTranscriptionEnabled()).resolves.toBe(true);
    expect(mockApi.get).toHaveBeenCalledWith("/transcribe/");
  });

  it("coerces a missing/false flag to false", async () => {
    mockApi.get.mockResolvedValueOnce({ data: {} });
    await expect(getTranscriptionEnabled()).resolves.toBe(false);
  });
});

describe("transcribeAudio", () => {
  it("POSTs a multipart form with the audio blob and returns the text", async () => {
    mockApi.post.mockResolvedValueOnce({ data: { text: "hello" } });
    const blob = new Blob(["x"], { type: "audio/webm" });

    const text = await transcribeAudio(blob);

    expect(text).toBe("hello");
    const [url, form, config] = mockApi.post.mock.calls[0];
    expect(url).toBe("/transcribe/");
    expect(form).toBeInstanceOf(FormData);
    expect((form as FormData).get("audio")).toBeInstanceOf(Blob);
    expect(config).toEqual({
      headers: { "Content-Type": "multipart/form-data" },
    });
  });

  it("returns an empty string when the response has no text", async () => {
    mockApi.post.mockResolvedValueOnce({ data: {} });
    const blob = new Blob(["x"], { type: "audio/ogg" });
    await expect(transcribeAudio(blob)).resolves.toBe("");
  });
});
