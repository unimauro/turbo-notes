"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
  const [editorTarget, setEditorTarget] = useState<EditorTarget>(null);
  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);

  const params = categoryId !== null ? { category: categoryId } : {};
  const {
    notes,
    isPending,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useNotes(params);
  const { data: categories = [] } = useCategories();
  const deleteNote = useDeleteNote();

  // Sentinel below the list: when it scrolls into view and there's another page
  // (and we're not already fetching one), pull the next page automatically.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  function handleSelectCategory(id: number | null) {
    // Changing the category swaps the queryKey, so the list refetches from
    // page 1 on its own — no manual reset needed with infinite scroll.
    setCategoryId(id);
  }

  function handleConfirmDelete() {
    if (deleteTarget) {
      deleteNote.mutate(deleteTarget.id);
    }
    setDeleteTarget(null);
  }

  function handleLogout() {
    logout();
    router.replace("/login");
  }

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

              {/* Sentinel: scrolling it into view loads the next page. */}
              <div ref={sentinelRef} aria-hidden="true" className="h-px" />

              {isFetchingNextPage && (
                <div
                  role="status"
                  aria-label="Loading more notes"
                  className="mt-8 flex items-center justify-center gap-2 text-sm text-ink-soft dark:text-linen-soft"
                >
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Loading more…
                </div>
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
