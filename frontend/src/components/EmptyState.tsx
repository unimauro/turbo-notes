"use client";

import { FileText, Plus, SearchX } from "lucide-react";

interface EmptyStateProps {
  /** "no-notes": brand-new workspace · "no-results": search found nothing */
  variant: "no-notes" | "no-results";
  searchTerm?: string;
  onCreate?: () => void;
}

export default function EmptyState({
  variant,
  searchTerm,
  onCreate,
}: EmptyStateProps) {
  const isSearch = variant === "no-results";

  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 px-6 py-20 text-center dark:border-zinc-700"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500">
        {isSearch ? (
          <SearchX className="h-6 w-6" aria-hidden="true" />
        ) : (
          <FileText className="h-6 w-6" aria-hidden="true" />
        )}
      </span>
      <h2 className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {isSearch ? "No results found" : "No notes yet"}
      </h2>
      <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
        {isSearch
          ? `No notes match “${searchTerm ?? ""}”. Try a different search term.`
          : "Create your first note to get started."}
      </p>
      {!isSearch && onCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New note
        </button>
      )}
    </div>
  );
}
