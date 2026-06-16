/**
 * Autosave tests: fake timers drive the 800ms debounce; the service layer is
 * mocked so we can assert exactly when create/PATCH fire.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";

jest.mock("@/services/notes", () => ({
  listNotes: jest.fn(),
  createNote: jest.fn(),
  updateNote: jest.fn(),
  deleteNote: jest.fn(),
}));

// AI transcription is disabled by default in these tests (no MediaRecorder in
// jsdom anyway); the editor must fall back to Web Speech / plain editing.
jest.mock("@/services/transcription", () => ({
  getTranscriptionEnabled: jest.fn().mockResolvedValue(false),
  transcribeAudio: jest.fn(),
}));

// AI text-to-speech is disabled by default in these tests; the editor falls
// back to the browser's Web Speech synthesis (or hides the button in jsdom,
// which exposes no speechSynthesis).
jest.mock("@/services/tts", () => ({
  getTtsEnabled: jest.fn().mockResolvedValue({ enabled: false, voice: "" }),
  speak: jest.fn(),
}));

// AI assist is disabled by default in these tests; the editor must hide the
// suggest-title / summarize buttons entirely.
jest.mock("@/services/assist", () => ({
  getAssistEnabled: jest.fn().mockResolvedValue(false),
  assist: jest.fn(),
}));

// Mock the Whisper recorder so tests can drive its callbacks (onCommand /
// onTranscript) directly and reproduce the "transcript arrives after the close
// is triggered" ordering that the race fix targets. The captured options let a
// test fire the hands-free command and then deliver the (delayed) transcript.
let whisperOptions: {
  onTranscript: (text: string) => void;
  onError?: (m: string) => void;
  onCommand?: () => void;
} | null = null;
const whisperStopMock = jest.fn();
jest.mock("@/hooks/useWhisperRecorder", () => ({
  useWhisperRecorder: (opts: {
    onTranscript: (text: string) => void;
    onError?: (m: string) => void;
    onCommand?: () => void;
  }) => {
    whisperOptions = opts;
    return {
      supported: true,
      listening: true,
      transcribing: false,
      error: null,
      start: jest.fn(),
      stop: whisperStopMock,
    };
  },
}));

import NoteEditor, { AUTOSAVE_DELAY_MS } from "@/components/NoteEditor";
import { assist, getAssistEnabled } from "@/services/assist";
import { createNote, updateNote } from "@/services/notes";
import { getTranscriptionEnabled } from "@/services/transcription";
import type { Category, Note } from "@/types/note";

const createNoteMock = createNote as jest.Mock;
const updateNoteMock = updateNote as jest.Mock;
const getAssistEnabledMock = getAssistEnabled as jest.Mock;
const assistMock = assist as jest.Mock;
const getTranscriptionEnabledMock = getTranscriptionEnabled as jest.Mock;

const categories: Category[] = [
  { id: 1, name: "Random Thoughts", color: "coral", note_count: 0 },
  { id: 2, name: "School", color: "yellow", note_count: 0 },
  { id: 3, name: "Personal", color: "teal", note_count: 0 },
  { id: 4, name: "Drama", color: "lavender", note_count: 0 },
];

const savedNote: Note = {
  id: 42,
  title: "Hi",
  content: "",
  category: { id: 1, name: "Random Thoughts", color: "coral" },
  created_at: "2026-06-10T10:00:00Z",
  updated_at: "2026-06-10T10:00:00Z",
};

function renderEditor(note: Note | null, onClose = jest.fn()) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <NoteEditor
        note={note}
        categories={categories}
        activeParams={{}}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
  return onClose;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  whisperOptions = null;
});

afterEach(() => {
  jest.useRealTimers();
});

/**
 * Drains the close sequence: the flush promise chain plus the forming-card
 * transition's sequential setTimeout beats (evaporate → optional AI naming →
 * hold → settle). Each await in the sequence schedules its timer only after the
 * previous microtask settles, so we interleave timer-advances with microtask
 * flushes a few times to run the whole chain to onClose().
 */
async function settleClose() {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });
  }
}

describe("NoteEditor autosave", () => {
  it("creates the note once, debounced 800ms after the first change", async () => {
    createNoteMock.mockResolvedValue(savedNote);
    renderEditor(null);

    const title = screen.getByPlaceholderText("Note Title");
    fireEvent.change(title, { target: { value: "H" } });
    fireEvent.change(title, { target: { value: "Hi" } });

    // Still inside the debounce window: nothing sent yet.
    await act(async () => {
      jest.advanceTimersByTime(AUTOSAVE_DELAY_MS - 1);
    });
    expect(createNoteMock).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(createNoteMock).toHaveBeenCalledTimes(1);
    expect(createNoteMock).toHaveBeenCalledWith({
      title: "Hi",
      content: "",
      category_id: 1, // defaults to Random Thoughts
    });
  });

  it("PATCHes (not re-creates) on subsequent edits", async () => {
    createNoteMock.mockResolvedValue(savedNote);
    updateNoteMock.mockResolvedValue({ ...savedNote, content: "more" });
    renderEditor(null);

    fireEvent.change(screen.getByPlaceholderText("Note Title"), {
      target: { value: "Hi" },
    });
    await act(async () => {
      jest.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });

    fireEvent.change(screen.getByPlaceholderText("Pour your heart out..."), {
      target: { value: "more" },
    });
    await act(async () => {
      jest.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });

    expect(createNoteMock).toHaveBeenCalledTimes(1);
    expect(updateNoteMock).toHaveBeenCalledTimes(1);
    expect(updateNoteMock).toHaveBeenCalledWith(42, {
      title: "Hi",
      content: "more",
      category_id: 1,
    });
  });

  it("flushes the pending change immediately on close (X)", async () => {
    updateNoteMock.mockResolvedValue(savedNote);
    const onClose = renderEditor(savedNote);

    fireEvent.change(screen.getByPlaceholderText("Pour your heart out..."), {
      target: { value: "unsaved thought" },
    });

    // Close before the debounce elapses — the change must not be lost.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /close editor/i }));
    });
    // Let the flush promise chain settle, then run the forming-card transition's
    // timers through to onClose().
    await settleClose();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(updateNoteMock).toHaveBeenCalledTimes(1);
    expect(updateNoteMock).toHaveBeenCalledWith(42, {
      title: "Hi",
      content: "unsaved thought",
      category_id: 1,
    });
  });

  it("does nothing on close when nothing changed", async () => {
    const onClose = renderEditor(savedNote);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /close editor/i }));
    });
    await settleClose();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(createNoteMock).not.toHaveBeenCalled();
    expect(updateNoteMock).not.toHaveBeenCalled();
  });

  it("hides the dictate (mic) button when SpeechRecognition is unsupported", () => {
    // jsdom exposes no SpeechRecognition/webkitSpeechRecognition, so the mic
    // button must not render — and the editor must still render normally.
    renderEditor(savedNote);

    expect(
      screen.queryByRole("button", { name: /dictate note/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Note Title")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Pour your heart out..."),
    ).toBeInTheDocument();
  });

  it("shows the dictate (mic) button when SpeechRecognition is available", () => {
    const recogInstances: Array<{ start: jest.Mock; abort: jest.Mock }> = [];
    class FakeRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      onresult: unknown = null;
      onerror: unknown = null;
      onend: unknown = null;
      onstart: unknown = null;
      start = jest.fn();
      stop = jest.fn();
      abort = jest.fn();
      constructor() {
        recogInstances.push(this);
      }
    }
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
      FakeRecognition;
    try {
      renderEditor(savedNote);
      expect(
        screen.getByRole("button", { name: /dictate note/i }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /dictate note/i }));
      // Recognition started and the active-recording "Stop dictation" pill shows.
      expect(recogInstances).toHaveLength(1);
      expect(recogInstances[0].start).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole("button", { name: /stop dictation/i }),
      ).toBeInTheDocument();
    } finally {
      delete (window as unknown as { SpeechRecognition?: unknown })
        .SpeechRecognition;
    }
  });

  it("still edits and autosaves when AI transcription is disabled/unsupported", async () => {
    // getTranscriptionEnabled resolves false (mocked above) and jsdom has no
    // MediaRecorder, so the AI mic path is off — the editor must work normally.
    createNoteMock.mockResolvedValue(savedNote);
    renderEditor(null);

    fireEvent.change(screen.getByPlaceholderText("Pour your heart out..."), {
      target: { value: "typed by hand" },
    });
    await act(async () => {
      jest.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });

    expect(createNoteMock).toHaveBeenCalledTimes(1);
    expect(createNoteMock).toHaveBeenCalledWith({
      title: "",
      content: "typed by hand",
      category_id: 1,
    });
    // No "transcribing" indicator should ever appear in this mode.
    expect(screen.queryByText(/transcribing/i)).not.toBeInTheDocument();
  });

  it("renders the read-aloud (headphones) button via the browser fallback when TTS is disabled", () => {
    // jsdom has no speechSynthesis, so stub a minimal one to exercise the
    // browser fallback path. We never actually play audio here.
    const synth = {
      cancel: jest.fn(),
      speak: jest.fn(),
      getVoices: jest.fn().mockReturnValue([]),
      addEventListener: jest.fn(),
    };
    (window as unknown as { speechSynthesis: unknown }).speechSynthesis = synth;
    try {
      renderEditor(savedNote);
      expect(
        screen.getByRole("button", { name: /read note aloud/i }),
      ).toBeInTheDocument();
    } finally {
      delete (window as unknown as { speechSynthesis?: unknown })
        .speechSynthesis;
    }
  });

  it("disables the read-aloud button on an empty note and enables it once there's text", () => {
    const synth = {
      cancel: jest.fn(),
      speak: jest.fn(),
      getVoices: jest.fn().mockReturnValue([]),
      addEventListener: jest.fn(),
    };
    (window as unknown as { speechSynthesis: unknown }).speechSynthesis = synth;
    try {
      // Brand-new, empty note: nothing to read aloud.
      renderEditor(null);
      const listen = screen.getByRole("button", { name: /read note aloud/i });
      expect(listen).toBeDisabled();

      // Type some content — the button becomes enabled.
      fireEvent.change(screen.getByPlaceholderText("Pour your heart out..."), {
        target: { value: "now there's something to read" },
      });
      expect(
        screen.getByRole("button", { name: /read note aloud/i }),
      ).toBeEnabled();
    } finally {
      delete (window as unknown as { speechSynthesis?: unknown })
        .speechSynthesis;
    }
  });

  it("hides the AI assist buttons when assist is disabled", async () => {
    // getAssistEnabled resolves false (mocked above), so neither button renders.
    renderEditor(savedNote);
    await act(async () => {
      await Promise.resolve();
    });

    expect(
      screen.queryByRole("button", { name: /suggest a title/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /summarize note/i }),
    ).not.toBeInTheDocument();
  });

  it("suggests a title and autosaves it when assist is enabled", async () => {
    getAssistEnabledMock.mockResolvedValueOnce(true);
    assistMock.mockResolvedValueOnce("A Crisp Title");
    updateNoteMock.mockResolvedValue(savedNote);
    // The note needs some body text for the assist buttons to be enabled.
    renderEditor({ ...savedNote, content: "some body to title" });

    // Let the GET /assist/ availability probe resolve so the buttons render.
    await act(async () => {
      await Promise.resolve();
    });

    const button = screen.getByRole("button", { name: /suggest a title/i });
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });

    // The suggestion landed in the title field...
    expect(screen.getByPlaceholderText("Note Title")).toHaveValue("A Crisp Title");
    expect(assistMock).toHaveBeenCalledWith(expect.any(String), "title");

    // ...and it autosaves via the same latestRef + scheduleSave path.
    await act(async () => {
      jest.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });
    expect(updateNoteMock).toHaveBeenCalledWith(42, {
      title: "A Crisp Title",
      content: "some body to title",
      category_id: 1,
    });
  });

  it("changing the category schedules a save too", async () => {
    updateNoteMock.mockResolvedValue(savedNote);
    renderEditor(savedNote);

    fireEvent.click(screen.getByRole("button", { name: /random thoughts/i }));
    fireEvent.click(screen.getByRole("option", { name: /drama/i }));

    await act(async () => {
      jest.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });

    expect(updateNoteMock).toHaveBeenCalledWith(42, {
      title: "Hi",
      content: "",
      category_id: 4,
    });
  });

  it("a category change after a content edit keeps the edited content", async () => {
    // Field handlers must build the payload from the authoritative snapshot, not
    // the stale render closure, so picking a category can't revert content.
    updateNoteMock.mockResolvedValue(savedNote);
    renderEditor(savedNote);

    fireEvent.change(screen.getByPlaceholderText("Pour your heart out..."), {
      target: { value: "fresh body" },
    });
    fireEvent.click(screen.getByRole("button", { name: /random thoughts/i }));
    fireEvent.click(screen.getByRole("option", { name: /drama/i }));

    await act(async () => {
      jest.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });

    const lastCall = updateNoteMock.mock.calls.at(-1);
    expect(lastCall).toEqual([
      42,
      { title: "Hi", content: "fresh body", category_id: 4 },
    ]);
  });

  it("keeps the editor open and surfaces an error when the final save fails", async () => {
    // The last flush on close rejects; we must NOT unmount (data loss) and must
    // show an error so the user can retry.
    updateNoteMock.mockRejectedValue(new Error("network down"));
    const onClose = renderEditor(savedNote);

    fireEvent.change(screen.getByPlaceholderText("Pour your heart out..."), {
      target: { value: "must not be lost" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /close editor/i }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't save/i);
    // The user's text is still in the textarea.
    expect(screen.getByPlaceholderText("Pour your heart out...")).toHaveValue(
      "must not be lost",
    );
  });
});

describe("NoteEditor hands-free close — transcript race fix", () => {
  // Enable AI transcription (so the editor uses the mocked Whisper recorder) and
  // AI assist (so an untitled note gets a generated title on close).
  beforeEach(() => {
    getTranscriptionEnabledMock.mockResolvedValue(true);
    getAssistEnabledMock.mockResolvedValue(true);
    createNoteMock.mockResolvedValue(savedNote);
    updateNoteMock.mockResolvedValue(savedNote);
  });

  it("generates the title from a transcript that arrives AFTER the close is triggered", async () => {
    // The bug: on a long note the 4s safety-net timer fired turboClose before
    // the Whisper transcript was appended, so the title was generated from empty
    // content (note saved "Untitled"). The fix makes turboClose await the
    // pending transcript first. Here we reproduce the worst-case ordering:
    // command heard → safety-net fires turboClose → THEN the transcript lands.
    assistMock.mockResolvedValue("A Generated Title");
    const onClose = jest.fn();
    renderEditor(null, onClose);

    // Let the availability probes (transcription + assist) resolve.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(whisperOptions).not.toBeNull();

    // (1) The real-time listener hears "close my note" — arms pendingFinish,
    // the pendingTranscript promise, and the 4s safety-net timer.
    await act(async () => {
      whisperOptions!.onCommand!();
    });

    // (2) The safety-net timer fires turboClose BEFORE the transcript appends.
    // turboClose must now AWAIT the pending transcript rather than read empty
    // content — so assist is NOT called yet.
    await act(async () => {
      jest.advanceTimersByTime(4000);
      await Promise.resolve();
    });
    expect(assistMock).not.toHaveBeenCalled();

    // (3) The delayed Whisper transcript finally lands. It appends the content
    // and resolves the pending transcript, unblocking turboClose's title-gen.
    await act(async () => {
      whisperOptions!.onTranscript("this is a long dictated note body");
      await Promise.resolve();
      await Promise.resolve();
    });

    // Drive the forming-card transition (and its title-gen beat) to completion.
    await settleClose();

    // The title was generated from the FINAL content (not empty)...
    expect(assistMock).toHaveBeenCalledWith(
      "this is a long dictated note body",
      "title",
    );

    // ...and the generated title was persisted (in whichever save call landed it
    // — create may fire first with the content, then a PATCH adds the title).
    expect(onClose).toHaveBeenCalledTimes(1);
    const allSaves = [
      ...createNoteMock.mock.calls.map((c) => c[0]),
      ...updateNoteMock.mock.calls.map((c) => c[1]),
    ];
    expect(allSaves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "A Generated Title" }),
      ]),
    );
    // The dictated content was saved too (never lost to the race).
    expect(allSaves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: "this is a long dictated note body",
        }),
      ]),
    );
  });

  it("still closes cleanly when Whisper yields no transcript at all (genuine failure)", async () => {
    // If the clip is empty / transcription fails, appendDictation never fires.
    // The safety-net must still close — and with no content, skipping the title
    // is correct (no stuck editor, no spurious assist call).
    assistMock.mockResolvedValue("Should Not Be Used");
    const onClose = jest.fn();
    renderEditor(null, onClose);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      whisperOptions!.onCommand!();
    });
    // Safety-net fires; no transcript ever arrives.
    await act(async () => {
      jest.advanceTimersByTime(4000);
      await Promise.resolve();
    });
    await settleClose();

    // Closed cleanly; no title generated (no content to title).
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(assistMock).not.toHaveBeenCalled();
  });
});

describe("NoteEditor — 'card being created' close transition", () => {
  it("shows the forming-card overlay on X close, then reveals the board", async () => {
    updateNoteMock.mockResolvedValue(savedNote);
    const onClose = renderEditor(savedNote);

    fireEvent.change(screen.getByPlaceholderText("Pour your heart out..."), {
      target: { value: "a thought worth keeping" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /close editor/i }));
      // Let the flush settle so the forming-card overlay mounts.
      await Promise.resolve();
      await Promise.resolve();
    });

    // The forming "card being created" overlay renders with the note's title.
    const overlay = screen.getByRole("status", { name: /creating your card/i });
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveTextContent(/Hi/);

    // The transition resolves and the editor closes.
    await settleClose();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
