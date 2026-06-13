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
});
