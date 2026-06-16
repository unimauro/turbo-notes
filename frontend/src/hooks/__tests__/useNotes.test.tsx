/**
 * Optimistic-mutation tests: the service layer is mocked; we drive the hooks
 * through a real QueryClient and assert the infinite cache is updated
 * optimistically and fully rolled back when the server rejects.
 *
 * The list cache is now `InfiniteData<Paginated<Note>>`, i.e.
 * `{ pages: Paginated<Note>[], pageParams: number[] }`, so assertions read
 * through `data.pages[*].results`.
 */
import {
  QueryClient,
  QueryClientProvider,
  type InfiniteData,
} from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

jest.mock("@/services/notes", () => ({
  listNotes: jest.fn(),
  createNote: jest.fn(),
  updateNote: jest.fn(),
  deleteNote: jest.fn(),
}));

import {
  getNextPageParam,
  notesKeys,
  useCreateNote,
  useDeleteNote,
  useUpdateNote,
} from "@/hooks/useNotes";
import { createNote, deleteNote, updateNote } from "@/services/notes";
import type { CategoryRef, Note, Paginated } from "@/types/note";

const createNoteMock = createNote as jest.Mock;
const updateNoteMock = updateNote as jest.Mock;
const deleteNoteMock = deleteNote as jest.Mock;

const coral: CategoryRef = { id: 1, name: "Random Thoughts", color: "coral" };
const teal: CategoryRef = { id: 3, name: "Personal", color: "teal" };

const existing: Note = {
  id: 7,
  title: "Groceries",
  content: "Milk",
  category: coral,
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
};

const params = {};
const listKey = notesKeys.list(params);

type NotesInfinite = InfiniteData<Paginated<Note>, number>;

function seededClient(): QueryClient {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const data: NotesInfinite = {
    pages: [{ count: 1, next: null, previous: null, results: [existing] }],
    pageParams: [1],
  };
  qc.setQueryData(listKey, data);
  return qc;
}

function wrapperFor(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

/** Flattened notes across all cached pages (mirrors the hook's `notes`). */
function cachedResults(qc: QueryClient): Note[] {
  const data = qc.getQueryData<NotesInfinite>(listKey);
  return data?.pages.flatMap((page) => page.results) ?? [];
}

/** Total count from the first cached page. */
function cachedCount(qc: QueryClient): number | undefined {
  return qc.getQueryData<NotesInfinite>(listKey)?.pages[0]?.count;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getNextPageParam", () => {
  it("returns undefined when DRF reports no next page", () => {
    expect(
      getNextPageParam({ count: 1, next: null, previous: null, results: [] }),
    ).toBeUndefined();
  });

  it("parses the page number out of the DRF next URL", () => {
    expect(
      getNextPageParam({
        count: 50,
        next: "https://api.example.com/notes/?page=3",
        previous: null,
        results: [],
      }),
    ).toBe(3);
  });

  it("defaults to page 2 when next has no explicit page param", () => {
    expect(
      getNextPageParam({
        count: 50,
        next: "https://api.example.com/notes/",
        previous: null,
        results: [],
      }),
    ).toBe(2);
  });
});

describe("useCreateNote", () => {
  const vars = {
    input: { title: "New idea", content: "Shiny", category_id: 1 },
    category: coral,
  };

  it("optimistically prepends the note before the server responds", async () => {
    const qc = seededClient();
    // Never-resolving promise: the optimistic state must appear on its own.
    createNoteMock.mockReturnValueOnce(new Promise(() => {}));

    const { result } = renderHook(() => useCreateNote(params), {
      wrapper: wrapperFor(qc),
    });
    result.current.mutate(vars);

    await waitFor(() => {
      const results = cachedResults(qc);
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        title: "New idea",
        content: "Shiny",
        category: coral,
      });
      expect(results[0].id).toBeLessThan(0); // optimistic marker
    });
    expect(cachedCount(qc)).toBe(2);
  });

  it("rolls the cache back when the create fails", async () => {
    const qc = seededClient();
    createNoteMock.mockRejectedValueOnce(new Error("500"));

    const { result } = renderHook(() => useCreateNote(params), {
      wrapper: wrapperFor(qc),
    });

    await expect(result.current.mutateAsync(vars)).rejects.toThrow("500");

    expect(cachedResults(qc)).toEqual([existing]);
    expect(cachedCount(qc)).toBe(1);
  });
});

describe("useUpdateNote", () => {
  const vars = {
    id: 7,
    input: { title: "Renamed", content: "Milk + eggs" },
    category: teal,
  };

  it("optimistically applies title, content and category", async () => {
    const qc = seededClient();
    updateNoteMock.mockReturnValueOnce(new Promise(() => {}));

    const { result } = renderHook(() => useUpdateNote(), {
      wrapper: wrapperFor(qc),
    });
    result.current.mutate(vars);

    await waitFor(() => {
      expect(cachedResults(qc)[0]).toMatchObject({
        id: 7,
        title: "Renamed",
        content: "Milk + eggs",
        category: teal,
      });
    });
  });

  it("rolls the cache back when the update fails", async () => {
    const qc = seededClient();
    updateNoteMock.mockRejectedValueOnce(new Error("nope"));

    const { result } = renderHook(() => useUpdateNote(), {
      wrapper: wrapperFor(qc),
    });

    await expect(result.current.mutateAsync(vars)).rejects.toThrow("nope");

    expect(cachedResults(qc)).toEqual([existing]);
  });
});

describe("useDeleteNote", () => {
  it("optimistically removes the note and decrements the count", async () => {
    const qc = seededClient();
    deleteNoteMock.mockReturnValueOnce(new Promise(() => {}));

    const { result } = renderHook(() => useDeleteNote(), {
      wrapper: wrapperFor(qc),
    });
    result.current.mutate(7);

    await waitFor(() => {
      expect(cachedResults(qc)).toHaveLength(0);
    });
    expect(cachedCount(qc)).toBe(0);
  });

  it("restores the note when the delete fails", async () => {
    const qc = seededClient();
    deleteNoteMock.mockRejectedValueOnce(new Error("denied"));

    const { result } = renderHook(() => useDeleteNote(), {
      wrapper: wrapperFor(qc),
    });

    await expect(result.current.mutateAsync(7)).rejects.toThrow("denied");

    expect(cachedResults(qc)).toEqual([existing]);
    expect(cachedCount(qc)).toBe(1);
  });
});
