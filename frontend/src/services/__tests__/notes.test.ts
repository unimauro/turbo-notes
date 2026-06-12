/**
 * Service-layer tests: axios is fully mocked; we assert the exact URLs,
 * params and payloads the API client sends, plus response unwrapping.
 */
import type { Note, Paginated } from "@/types/note";

// The factory is hoisted above imports, so the instance must live inside it.
jest.mock("axios", () => {
  const instance = {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  };
  return { __esModule: true, default: { create: jest.fn(() => instance) } };
});

import axios from "axios";
import { createNote, deleteNote, listNotes, updateNote } from "@/services/notes";

// Captured at import time, before beforeEach(clearAllMocks) wipes call records.
const createMock = axios.create as jest.Mock;
const mockInstance = createMock.mock.results[0].value;
const createConfig = createMock.mock.calls[0][0];

const note: Note = {
  id: 7,
  title: "Title",
  content: "Content",
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

describe("api client configuration", () => {
  it("creates the axios instance with the default base URL", () => {
    expect(createConfig).toEqual(
      expect.objectContaining({
        baseURL: "http://localhost:8000/api/v1",
      }),
    );
  });
});

describe("listNotes", () => {
  it("GETs /notes/ with no params by default", async () => {
    mockInstance.get.mockResolvedValueOnce({ data: page });

    const result = await listNotes();

    expect(mockInstance.get).toHaveBeenCalledWith("/notes/", { params: {} });
    expect(result).toEqual(page);
  });

  it("passes search and page params, omitting page 1", async () => {
    mockInstance.get.mockResolvedValueOnce({ data: page });

    await listNotes({ search: "milk", page: 1 });

    expect(mockInstance.get).toHaveBeenCalledWith("/notes/", {
      params: { search: "milk" },
    });
  });

  it("includes page when greater than 1 and ordering when given", async () => {
    mockInstance.get.mockResolvedValueOnce({ data: page });

    await listNotes({ search: "milk", page: 3, ordering: "-updated_at" });

    expect(mockInstance.get).toHaveBeenCalledWith("/notes/", {
      params: { search: "milk", page: 3, ordering: "-updated_at" },
    });
  });
});

describe("createNote", () => {
  it("POSTs the payload to /notes/ and returns the created note", async () => {
    mockInstance.post.mockResolvedValueOnce({ data: note });

    const result = await createNote({ title: "Title", content: "Content" });

    expect(mockInstance.post).toHaveBeenCalledWith("/notes/", {
      title: "Title",
      content: "Content",
    });
    expect(result).toEqual(note);
  });
});

describe("updateNote", () => {
  it("PATCHes /notes/:id/ with the partial payload", async () => {
    mockInstance.patch.mockResolvedValueOnce({ data: note });

    const result = await updateNote(7, { title: "Renamed" });

    expect(mockInstance.patch).toHaveBeenCalledWith("/notes/7/", {
      title: "Renamed",
    });
    expect(result).toEqual(note);
  });
});

describe("deleteNote", () => {
  it("DELETEs /notes/:id/", async () => {
    mockInstance.delete.mockResolvedValueOnce({ status: 204 });

    await deleteNote(7);

    expect(mockInstance.delete).toHaveBeenCalledWith("/notes/7/");
  });
});
