"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import {
  createNote,
  deleteNote,
  listNotes,
  updateNote,
  type ListNotesParams,
} from "@/services/notes";
import type { Note, NoteInput, Paginated } from "@/types/note";

export const notesKeys = {
  all: ["notes"] as const,
  list: (params: ListNotesParams) => ["notes", "list", params] as const,
};

type NotesPage = Paginated<Note>;
type Snapshot = [readonly unknown[], NotesPage | undefined][];

/** Paginated, searchable notes list. Previous page is kept while fetching. */
export function useNotes(params: ListNotesParams) {
  return useQuery({
    queryKey: notesKeys.list(params),
    queryFn: () => listNotes(params),
    placeholderData: keepPreviousData,
  });
}

/* ------------------------------------------------------------------------ *
 * Optimistic mutations
 *
 * All three mutations follow the same recipe:
 *   onMutate  — cancel in-flight list queries, snapshot every cached page,
 *               write the optimistic result into the cache
 *   onError   — restore the snapshot (full rollback)
 *   onSettled — invalidate so the server state wins either way
 * ------------------------------------------------------------------------ */

function snapshotLists(qc: QueryClient): Snapshot {
  return qc.getQueriesData<NotesPage>({ queryKey: notesKeys.all });
}

function restoreLists(qc: QueryClient, snapshot: Snapshot | undefined): void {
  snapshot?.forEach(([key, data]) => qc.setQueryData(key, data));
}

export function useCreateNote(activeParams: ListNotesParams) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: NoteInput) => createNote(input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: notesKeys.all });
      const snapshot = snapshotLists(qc);

      const now = new Date().toISOString();
      // Negative id marks the note as optimistic; replaced after refetch.
      const optimistic: Note = {
        id: -Date.now(),
        title: input.title,
        content: input.content,
        created_at: now,
        updated_at: now,
      };

      qc.setQueryData<NotesPage>(notesKeys.list(activeParams), (old) =>
        old
          ? { ...old, count: old.count + 1, results: [optimistic, ...old.results] }
          : { count: 1, next: null, previous: null, results: [optimistic] },
      );

      return { snapshot };
    },
    onError: (_err, _input, ctx) => restoreLists(qc, ctx?.snapshot),
    onSettled: () => qc.invalidateQueries({ queryKey: notesKeys.all }),
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: NoteInput }) =>
      updateNote(id, input),
    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: notesKeys.all });
      const snapshot = snapshotLists(qc);

      const updatedAt = new Date().toISOString();
      snapshot.forEach(([key, page]) => {
        if (!page) return;
        qc.setQueryData<NotesPage>(key, {
          ...page,
          results: page.results.map((note) =>
            note.id === id ? { ...note, ...input, updated_at: updatedAt } : note,
          ),
        });
      });

      return { snapshot };
    },
    onError: (_err, _vars, ctx) => restoreLists(qc, ctx?.snapshot),
    onSettled: () => qc.invalidateQueries({ queryKey: notesKeys.all }),
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteNote(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: notesKeys.all });
      const snapshot = snapshotLists(qc);

      snapshot.forEach(([key, page]) => {
        if (!page) return;
        const results = page.results.filter((note) => note.id !== id);
        if (results.length === page.results.length) return;
        qc.setQueryData<NotesPage>(key, {
          ...page,
          count: Math.max(0, page.count - 1),
          results,
        });
      });

      return { snapshot };
    },
    onError: (_err, _id, ctx) => restoreLists(qc, ctx?.snapshot),
    onSettled: () => qc.invalidateQueries({ queryKey: notesKeys.all }),
  });
}
