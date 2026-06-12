"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useState } from "react";

import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import Header from "@/components/Header";
import NoteEditorModal from "@/components/NoteEditorModal";
import NoteList from "@/components/NoteList";
import SkeletonCard from "@/components/SkeletonCard";
import {
  useCreateNote,
  useDeleteNote,
  useNotes,
  useUpdateNote,
} from "@/hooks/useNotes";
import type { Note, NoteInput } from "@/types/note";

/** null = editor closed · "new" = creating · Note = editing that note. */
type EditorTarget = null | "new" | Note;

export default function Home() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editorTarget, setEditorTarget] = useState<EditorTarget>(null);
  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);

  const params = { search, page };
  const { data, isPending, isError, refetch } = useNotes(params);

  const createNote = useCreateNote(params);
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();

  const handleSearch = useCallback((term: string) => {
    setSearch(term);
    setPage(1);
  }, []);

  function handleSave(input: NoteInput) {
    if (editorTarget && editorTarget !== "new") {
      updateNote.mutate({ id: editorTarget.id, input });
    } else {
      createNote.mutate(input);
    }
    // Close immediately — optimistic updates make the result appear at once.
    setEditorTarget(null);
  }

  function handleConfirmDelete() {
    if (deleteTarget) {
      deleteNote.mutate(deleteTarget.id);
      // Deleting the last note of a page would leave it empty — step back.
      if (data && data.results.length === 1 && page > 1) {
        setPage((p) => p - 1);
      }
    }
    setDeleteTarget(null);
  }

  const notes = data?.results ?? [];
  const showEmpty = !isPending && !isError && notes.length === 0;

  return (
    <div className="flex min-h-screen flex-col">
      <Header onSearch={handleSearch} onNewNote={() => setEditorTarget("new")} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {isPending && (
          <div
            role="status"
            aria-label="Loading notes"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {Array.from({ length: 6 }, (_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {isError && !isPending && <ErrorState onRetry={() => refetch()} />}

        {showEmpty &&
          (search ? (
            <EmptyState variant="no-results" searchTerm={search} />
          ) : (
            <EmptyState
              variant="no-notes"
              onCreate={() => setEditorTarget("new")}
            />
          ))}

        {!isPending && !isError && notes.length > 0 && (
          <>
            <NoteList
              notes={notes}
              onEdit={(note) => setEditorTarget(note)}
              onDelete={(note) => setDeleteTarget(note)}
            />

            {(data?.next || data?.previous) && (
              <nav
                aria-label="Pagination"
                className="mt-8 flex items-center justify-center gap-4"
              >
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!data?.previous}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  Previous
                </button>
                <span className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
                  Page {page} · {data?.count ?? 0} notes
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!data?.next}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Next
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </nav>
            )}
          </>
        )}
      </main>

      {editorTarget !== null && (
        <NoteEditorModal
          // Key forces a fresh mount per target so fields never leak between notes.
          key={editorTarget === "new" ? "new" : editorTarget.id}
          note={editorTarget === "new" ? null : editorTarget}
          onSave={handleSave}
          onClose={() => setEditorTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete note?"
          description={`“${deleteTarget.title}” will be permanently deleted. This cannot be undone.`}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
