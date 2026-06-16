/**
 * useWhisperRecorder: focuses on the real-time finish-command listener that
 * runs alongside the Whisper MediaRecorder, and on graceful behavior when the
 * browser SpeechRecognition API is unsupported (as in jsdom). We do NOT try to
 * simulate live speech end-to-end; we drive the recognition handlers directly.
 */
import { act, renderHook } from "@testing-library/react";

jest.mock("@/services/transcription", () => ({
  transcribeAudio: jest.fn().mockResolvedValue(""),
}));

import { useWhisperRecorder } from "@/hooks/useWhisperRecorder";

// ---- Minimal MediaRecorder / getUserMedia stubs so `supported` is true ----
class FakeMediaRecorder {
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public stream: MediaStream) {}
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.onstop?.();
  }
}

function installMedia() {
  (window as unknown as { MediaRecorder: unknown }).MediaRecorder =
    FakeMediaRecorder;
  const track = { stop: jest.fn() };
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: jest
        .fn()
        .mockResolvedValue({ getTracks: () => [track] } as unknown as MediaStream),
    },
  });
}

function uninstallMedia() {
  delete (window as unknown as { MediaRecorder?: unknown }).MediaRecorder;
  // Leave navigator.mediaDevices stub in place; it's harmless across tests.
}

afterEach(() => {
  jest.clearAllMocks();
  uninstallMedia();
  delete (window as unknown as { SpeechRecognition?: unknown })
    .SpeechRecognition;
});

describe("useWhisperRecorder without SpeechRecognition (jsdom default)", () => {
  it("records and stops without throwing when SpeechRecognition is unsupported", async () => {
    installMedia();
    const onTranscript = jest.fn();
    const onCommand = jest.fn();
    const { result } = renderHook(() =>
      useWhisperRecorder({ onTranscript, onCommand }),
    );

    expect(result.current.supported).toBe(true);

    await act(async () => {
      result.current.start();
      await Promise.resolve();
    });
    expect(result.current.listening).toBe(true);

    // No SpeechRecognition in jsdom => the real-time command never fires.
    expect(onCommand).not.toHaveBeenCalled();

    await act(async () => {
      result.current.stop();
      await Promise.resolve();
    });
    expect(result.current.listening).toBe(false);
  });
});

describe("useWhisperRecorder real-time command listener", () => {
  // Capture the SpeechRecognition instance so we can drive its onresult.
  let recog: FakeRecognition | null = null;

  class FakeRecognition {
    continuous = false;
    interimResults = false;
    lang = "";
    onresult: ((e: unknown) => void) | null = null;
    onerror: (() => void) | null = null;
    onend: (() => void) | null = null;
    onstart: (() => void) | null = null;
    start = jest.fn();
    stop = jest.fn();
    abort = jest.fn();
  }

  function FakeRecognitionCtor(this: FakeRecognition) {
    const instance = new FakeRecognition();
    recog = instance;
    return instance;
  }

  function emit(transcript: string, isFinal = true) {
    recog?.onresult?.({
      resultIndex: 0,
      results: {
        length: 1,
        0: { 0: { transcript }, isFinal, length: 1 },
      },
    });
  }

  beforeEach(() => {
    recog = null;
    installMedia();
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
      FakeRecognitionCtor;
  });

  it("starts a parallel recognition when recording starts and fires onCommand once on a match", async () => {
    const onCommand = jest.fn();
    const { result } = renderHook(() =>
      useWhisperRecorder({ onTranscript: jest.fn(), onCommand }),
    );

    await act(async () => {
      result.current.start();
      await Promise.resolve();
    });

    // The parallel listener was constructed and started.
    expect(recog).not.toBeNull();
    expect(recog!.start).toHaveBeenCalledTimes(1);
    expect(recog!.continuous).toBe(true);
    expect(recog!.interimResults).toBe(true);

    act(() => {
      emit("close my note");
    });
    expect(onCommand).toHaveBeenCalledTimes(1);
    // It aborts itself on match...
    expect(recog!.abort).toHaveBeenCalled();

    // ...and a second matching result does not re-fire.
    act(() => {
      emit("close my notes again");
    });
    expect(onCommand).toHaveBeenCalledTimes(1);
  });

  it("does not fire onCommand on unrelated speech", async () => {
    const onCommand = jest.fn();
    const { result } = renderHook(() =>
      useWhisperRecorder({ onTranscript: jest.fn(), onCommand }),
    );
    await act(async () => {
      result.current.start();
      await Promise.resolve();
    });

    act(() => {
      emit("just some regular dictation here");
    });
    expect(onCommand).not.toHaveBeenCalled();
  });

  it("never throws on spurious recognition onerror/onend", async () => {
    const onCommand = jest.fn();
    const { result } = renderHook(() =>
      useWhisperRecorder({ onTranscript: jest.fn(), onCommand }),
    );
    await act(async () => {
      result.current.start();
      await Promise.resolve();
    });

    expect(() =>
      act(() => {
        recog?.onerror?.();
        recog?.onend?.();
      }),
    ).not.toThrow();
    expect(onCommand).not.toHaveBeenCalled();
  });
});
