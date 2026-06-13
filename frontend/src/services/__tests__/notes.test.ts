/**
 * Service-layer tests: the shared api instance is mocked; we assert the exact
 * URLs, params and payloads the client sends, plus response unwrapping.
 */
import type { Note, Paginated } from "@/types/note";

jest.mock("@/services/api", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

import { api } from "@/services/api";
import { createNote, deleteNote, listNotes, updateNote } from "@/services/notes";

const mockApi = api as jest.Mocked<typeof api>;

const note: Note = {
  id: 7,
  title: "Title",
  content: "Content",
  category: { id: 1, name: "Random Thoughts", color: "coral" },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
};

const page: Paginated<Note> = {
  count: 1,
  next: null,
  previous: null,
  results: [note],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("listNotes", () => {
  it("GETs /notes/ with no params by default", async () => {
    mockApi.get.mockResolvedValueOnce({ data: page });

    const result = await listNotes();

    expect(mockApi.get).toHaveBeenCalledWith("/notes/", { params: {} });
    expect(result).toEqual(page);
  });

  it("passes search and page params, omitting page 1", async () => {
    mockApi.get.mockResolvedValueOnce({ data: page });

    await listNotes({ search: "milk", page: 1 });

    expect(mockApi.get).toHaveBeenCalledWith("/notes/", {
      params: { search: "milk" },
    });
  });

  it("includes page, ordering and category when given", async () => {
    mockApi.get.mockResolvedValueOnce({ data: page });

    await listNotes({
      search: "milk",
      page: 3,
      ordering: "-updated_at",
      category: 2,
    });

    expect(mockApi.get).toHaveBeenCalledWith("/notes/", {
      params: { search: "milk", page: 3, ordering: "-updated_at", category: 2 },
    });
  });
});

describe("createNote", () => {
  it("POSTs the payload (including category_id) to /notes/", async () => {
    mockApi.post.mockResolvedValueOnce({ data: note });

    const result = await createNote({
      title: "Title",
      content: "Content",
      category_id: 1,
    });

    expect(mockApi.post).toHaveBeenCalledWith("/notes/", {
      title: "Title",
      content: "Content",
      category_id: 1,
    });
    expect(result).toEqual(note);
  });
});

describe("updateNote", () => {
  it("PATCHes /notes/:id/ with the partial payload", async () => {
    mockApi.patch.mockResolvedValueOnce({ data: note });

    const result = await updateNote(7, { title: "Renamed" });

    expect(mockApi.patch).toHaveBeenCalledWith("/notes/7/", {
      title: "Renamed",
    });
    expect(result).toEqual(note);
  });
});

describe("deleteNote", () => {
  it("DELETEs /notes/:id/", async () => {
    mockApi.delete.mockResolvedValueOnce({ status: 204 });

    await deleteNote(7);

    expect(mockApi.delete).toHaveBeenCalledWith("/notes/7/");
  });
});
