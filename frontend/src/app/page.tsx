"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import CategorySidebar from "@/components/CategorySidebar";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import NoteEditor from "@/components/NoteEditor";
import NoteList from "@/components/NoteList";
import SkeletonCard from "@/components/SkeletonCard";
import ThemeToggle from "@/components/ThemeToggle";
import { useCategories } from "@/hooks/useCategories";
import { useDeleteNote, useNotes } from "@/hooks/useNotes";
import { useAuth } from "@/lib/auth-context";
import type { Note } from "@/types/note";

/** null = editor closed · "new" = creating · Note = editing that note. */
type EditorTarget = null | "new" | Note;

const pagerButtonClass =
  "inline-flex h-9 items-center gap-1 rounded-full border border-ink-line bg-paper px-4 text-sm font-semibold text-ink transition-colors hover:bg-[#EFE3C8] disabled:cursor-not-allowed disabled:opacity-40 dark:border-linen-soft/60 dark:bg-bark-soft dark:text-linen dark:hover:bg-[#46382a]";

export default function Home() {
  const { ready, isAuthenticated } = useAuth();
  const router = useRouter();

  // Home is protected: bounce to /login as soon as we know there's no token.
  useEffect(() => {
    if (ready && !isAuthenticated) router.replace("/login");
  }, [ready, isAuthenticated, router]);

  if (!ready || !isAuthenticated) return null;
  return <Board />;
}

function Board() {
  const router = useRouter();
  const { logout } = useAuth();

  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [editorTarget, setEditorTarget] = useState<EditorTarget>(null);
  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);

  const params = {
    ...(categoryId !== null ? { category: categoryId } : {}),
    page,
  };
  const { data, isPending, isError, refetch } = useNotes(params);
  const { data: categories = [] } = useCategories();
  const deleteNote = useDeleteNote();

  function handleSelectCategory(id: number | null) {
    setCategoryId(id);
    setPage(1);
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

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  const notes = data?.results ?? [];
  const showEmpty = !isPending && !isError && notes.length === 0;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8">
      <header className="flex items-center justify-end gap-3">
        <ThemeToggle />
        <button
          type="button"
          onClick={handleLogout}
          className="text-xs text-ink-line underline underline-offset-2 transition-colors hover:text-ink dark:text-linen-soft dark:hover:text-linen"
        >
          Log out
        </button>
        <button
          type="button"
          onClick={() => setEditorTarget("new")}
          className="inline-flex h-11 items-center gap-1.5 rounded-full border border-ink-line bg-paper px-5 text-sm font-semibold text-ink transition-colors hover:bg-[#EFE3C8] focus:outline-none focus:ring-2 focus:ring-ink/20 dark:border-linen-soft/60 dark:bg-bark-soft dark:text-linen dark:hover:bg-[#46382a]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New Note
        </button>
      </header>

      <div className="mt-6 flex flex-1 flex-col gap-8 md:flex-row md:gap-10">
        <CategorySidebar
          categories={categories}
          selectedId={categoryId}
          onSelect={handleSelectCategory}
        />

        <main className="min-w-0 flex-1">
          {isPending && (
            <div
              role="status"
              aria-label="Loading notes"
              className="columns-1 gap-5 sm:columns-2 xl:columns-3"
            >
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="mb-5 break-inside-avoid">
                  <SkeletonCard />
                </div>
              ))}
            </div>
          )}

          {isError && !isPending && <ErrorState onRetry={() => refetch()} />}

          {showEmpty && <EmptyState />}

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
                    className={pagerButtonClass}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    Previous
                  </button>
                  <span className="text-sm tabular-nums text-ink-soft dark:text-linen-soft">
                    Page {page} · {data?.count ?? 0} notes
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!data?.next}
                    className={pagerButtonClass}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </nav>
              )}
            </>
          )}
        </main>
      </div>

      {editorTarget !== null && (
        <NoteEditor
          // Key forces a fresh mount per target so fields never leak between notes.
          key={editorTarget === "new" ? "new" : editorTarget.id}
          note={editorTarget === "new" ? null : editorTarget}
          categories={categories}
          activeParams={params}
          onClose={() => setEditorTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this note?"
          description={`“${deleteTarget.title.trim() || "Untitled"}” will be gone for good. This cannot be undone.`}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
