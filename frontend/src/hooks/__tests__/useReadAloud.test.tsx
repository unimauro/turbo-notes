/**
 * Unit tests for useReadAloud in isolation. The TTS service and the browser
 * speech helpers are mocked; jsdom has no speechSynthesis so we stub a minimal
 * one to exercise the browser-fallback path.
 */
import { act, renderHook, waitFor } from "@testing-library/react";

jest.mock("@/services/tts", () => ({
  getTtsEnabled: jest.fn(),
  speak: jest.fn(),
}));

jest.mock("@/lib/speech", () => ({
  loadVoices: jest.fn().mockResolvedValue([]),
  pickVoice: jest.fn().mockReturnValue(undefined),
  speakWithBrowser: jest.fn().mockReturnValue({}),
}));

import { useReadAloud } from "@/hooks/useReadAloud";
import { speakWithBrowser } from "@/lib/speech";
import { getTtsEnabled, speak } from "@/services/tts";

const getTtsEnabledMock = getTtsEnabled as jest.Mock;
const speakMock = speak as jest.Mock;
const speakWithBrowserMock = speakWithBrowser as jest.Mock;

function stubSynth() {
  const synth = {
    cancel: jest.fn(),
    speak: jest.fn(),
    getVoices: jest.fn().mockReturnValue([]),
    addEventListener: jest.fn(),
  };
  (window as unknown as { speechSynthesis: unknown }).speechSynthesis = synth;
  return synth;
}

beforeEach(() => {
  jest.clearAllMocks();
  getTtsEnabledMock.mockResolvedValue({ enabled: false, voice: "" });
});

afterEach(() => {
  delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
});

describe("useReadAloud availability", () => {
  it("is available and hasReadableContent reflects the note text", async () => {
    stubSynth();
    getTtsEnabledMock.mockResolvedValue({ enabled: true, voice: "alloy" });
    const { result } = renderHook(() => useReadAloud({ noteText: () => "hello" }));

    await waitFor(() => expect(result.current.available).toBe(true));
    expect(result.current.hasReadableContent).toBe(true);
  });

  it("hasReadableContent is false when there is nothing to read", () => {
    stubSynth();
    const { result } = renderHook(() => useReadAloud({ noteText: () => "" }));
    expect(result.current.hasReadableContent).toBe(false);
  });
});

describe("useReadAloud toggle (browser fallback)", () => {
  it("does nothing when there's no text", async () => {
    stubSynth();
    const { result } = renderHook(() => useReadAloud({ noteText: () => "" }));
    await act(async () => {
      result.current.toggle();
    });
    expect(speakMock).not.toHaveBeenCalled();
    expect(speakWithBrowserMock).not.toHaveBeenCalled();
    expect(result.current.speaking).toBe(false);
  });

  it("speaks via the browser voice when server TTS is disabled, and stop() resets", async () => {
    stubSynth();
    const { result } = renderHook(() => useReadAloud({ noteText: () => "read me" }));

    await act(async () => {
      result.current.toggle();
    });
    expect(speakMock).not.toHaveBeenCalled(); // TTS disabled → no server call
    expect(speakWithBrowserMock).toHaveBeenCalled();
    expect(result.current.speaking).toBe(true);

    act(() => {
      result.current.stop();
    });
    expect(result.current.speaking).toBe(false);
  });
});
