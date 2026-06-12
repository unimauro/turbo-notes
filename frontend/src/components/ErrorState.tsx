"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

interface ErrorStateProps {
  message?: string;
  onRetry: () => void;
}

export default function ErrorState({
  message = "Something went wrong while loading your notes.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-red-200 bg-red-50/50 px-6 py-20 text-center dark:border-red-900/50 dark:bg-red-950/20"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-500 dark:bg-red-950/60 dark:text-red-400">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        Couldn&apos;t load notes
      </h2>
      <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 text-sm font-medium text-zinc-900 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Try again
      </button>
    </div>
  );
}
