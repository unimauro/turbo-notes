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

import NoteEditor, { AUTOSAVE_DELAY_MS } from "@/components/NoteEditor";
import { createNote, updateNote } from "@/services/notes";
import type { Category, Note } from "@/types/note";

const createNoteMock = createNote as jest.Mock;
const updateNoteMock = updateNote as jest.Mock;

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
});

afterEach(() => {
  jest.useRealTimers();
});

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
    fireEvent.click(screen.getByRole("button", { name: /close editor/i }));
    await act(async () => {
      await Promise.resolve();
    });

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

    fireEvent.click(screen.getByRole("button", { name: /close editor/i }));
    await act(async () => {
      await Promise.resolve();
    });

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
