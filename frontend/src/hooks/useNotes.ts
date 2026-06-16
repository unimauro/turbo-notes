"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";

import { categoriesKeys } from "@/hooks/useCategories";
import {
  createNote,
  deleteNote,
  listNotes,
  updateNote,
  type ListNotesParams,
} from "@/services/notes";
import type { CategoryRef, Note, NoteInput, Paginated } from "@/types/note";

export const notesKeys = {
  all: ["notes"] as const,
  list: (params: ListNotesParams) => ["notes", "list", params] as const,
};

type NotesPage = Paginated<Note>;
type NotesInfinite = InfiniteData<NotesPage, number>;
type Snapshot = [readonly unknown[], NotesInfinite | undefined][];

/**
 * Derives the next DRF page number from a `Paginated.next` URL.
 * Returns `undefined` when there is no further page (DRF sends `next: null`).
 *
 * Exported for unit testing the pagination contract directly.
 */
export function getNextPageParam(lastPage: NotesPage): number | undefined {
  if (!lastPage.next) return undefined;
  // DRF emits absolute or relative URLs like ".../notes/?page=3"; the first page
  // omits `?page=` entirely, so a missing param means page 2.
  const match = /[?&]page=(\d+)/.exec(lastPage.next);
  return match ? Number(match[1]) : 2;
}

/**
 * Infinite, filterable notes list. Pages are fetched on demand as the board's
 * sentinel scrolls into view; the cache is shaped as
 * `{ pages: Paginated<Note>[], pageParams: number[] }`.
 */
export function useNotes(params: ListNotesParams) {
  const query = useInfiniteQuery({
    queryKey: notesKeys.list(params),
    queryFn: ({ pageParam }) => listNotes({ ...params, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam,
  });

  return {
    ...query,
    /** All loaded notes, flattened across pages. */
    notes: query.data?.pages.flatMap((page) => page.results) ?? [],
    /** Total server-side count (from the first loaded page). */
    count: query.data?.pages[0]?.count ?? 0,
  };
}

/* ------------------------------------------------------------------------ *
 * Optimistic mutations
 *
 * All three mutations follow the same recipe:
 *   onMutate  — cancel in-flight list queries, snapshot every cached infinite
 *               query, write the optimistic result into the cache
 *   onError   — restore the snapshot (full rollback)
 *   onSettled — invalidate (notes + category counts) so server state wins
 *
 * The cache value is now `InfiniteData<Paginated<Note>>`, so edits map across
 * `data.pages[*].results` instead of a single `{count, results}` object.
 * ------------------------------------------------------------------------ */

function snapshotLists(qc: QueryClient): Snapshot {
  return qc.getQueriesData<NotesInfinite>({ queryKey: notesKeys.all });
}

function restoreLists(qc: QueryClient, snapshot: Snapshot | undefined): void {
  snapshot?.forEach(([key, data]) => qc.setQueryData(key, data));
}

function invalidateAll(qc: QueryClient): void {
  qc.invalidateQueries({ queryKey: notesKeys.all });
  qc.invalidateQueries({ queryKey: categoriesKeys.all });
}

export interface CreateNoteVars {
  input: NoteInput;
  /** Full category for the optimistic card; the server echoes the real one back. */
  category: CategoryRef;
}

export interface UpdateNoteVars {
  id: number;
  input: Partial<NoteInput>;
  category?: CategoryRef;
}

export function useCreateNote(activeParams: ListNotesParams) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ input }: CreateNoteVars) => createNote(input),
    onMutate: async ({ input, category }) => {
      await qc.cancelQueries({ queryKey: notesKeys.all });
      const snapshot = snapshotLists(qc);

      const now = new Date().toISOString();
      // Negative id marks the note as optimistic; replaced after refetch.
      const optimistic: Note = {
        id: -Date.now(),
        title: input.title,
        content: input.content,
        category,
        created_at: now,
        updated_at: now,
      };

      qc.setQueryData<NotesInfinite>(notesKeys.list(activeParams), (old) => {
        if (!old || old.pages.length === 0) {
          // No page loaded yet — seed a single first page with the optimistic note.
          return {
            pages: [
              { count: 1, next: null, previous: null, results: [optimistic] },
            ],
            pageParams: [1],
          };
        }
        const [first, ...rest] = old.pages;
        return {
          ...old,
          pages: [
            {
              ...first,
              count: first.count + 1,
              results: [optimistic, ...first.results],
            },
            ...rest,
          ],
        };
      });

      return { snapshot };
    },
    onError: (_err, _vars, ctx) => restoreLists(qc, ctx?.snapshot),
    onSettled: () => invalidateAll(qc),
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: UpdateNoteVars) => updateNote(id, input),
    onMutate: async ({ id, input, category }) => {
      await qc.cancelQueries({ queryKey: notesKeys.all });
      const snapshot = snapshotLists(qc);

      const updatedAt = new Date().toISOString();
      snapshot.forEach(([key, data]) => {
        if (!data) return;
        qc.setQueryData<NotesInfinite>(key, {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            results: page.results.map((note) =>
              note.id === id
                ? {
                    ...note,
                    ...("title" in input ? { title: input.title ?? "" } : {}),
                    ...("content" in input
                      ? { content: input.content ?? "" }
                      : {}),
                    ...(category ? { category } : {}),
                    updated_at: updatedAt,
                  }
                : note,
            ),
          })),
        });
      });

      return { snapshot };
    },
    onError: (_err, _vars, ctx) => restoreLists(qc, ctx?.snapshot),
    onSettled: () => invalidateAll(qc),
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteNote(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: notesKeys.all });
      const snapshot = snapshotLists(qc);

      snapshot.forEach(([key, data]) => {
        if (!data) return;
        let removed = false;
        const pages = data.pages.map((page) => {
          const results = page.results.filter((note) => note.id !== id);
          if (results.length === page.results.length) return page;
          removed = true;
          return {
            ...page,
            count: Math.max(0, page.count - 1),
            results,
          };
        });
        if (!removed) return;
        qc.setQueryData<NotesInfinite>(key, { ...data, pages });
      });

      return { snapshot };
    },
    onError: (_err, _id, ctx) => restoreLists(qc, ctx?.snapshot),
    onSettled: () => invalidateAll(qc),
  });
}
