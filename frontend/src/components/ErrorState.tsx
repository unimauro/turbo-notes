"use client";

import { RotateCcw } from "lucide-react";

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
      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-line/60 px-6 py-20 text-center"
    >
      <h2 className="font-serif text-xl font-bold text-ink dark:text-linen">
        Oh no, a little hiccup
      </h2>
      <p className="mt-1.5 max-w-sm text-sm text-ink-soft dark:text-linen-soft">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-full border border-ink-line bg-paper px-5 text-sm font-semibold text-ink transition-colors hover:bg-[#EFE3C8] dark:border-linen-soft/60 dark:bg-bark-soft dark:text-linen dark:hover:bg-[#46382a]"
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Try again
      </button>
    </div>
  );
}
