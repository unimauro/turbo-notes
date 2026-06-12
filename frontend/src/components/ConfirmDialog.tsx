"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

import { useFocusTrap } from "@/hooks/useFocusTrap";

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Destructive-action confirmation. Mount only while open. */
export default function ConfirmDialog({
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useFocusTrap(dialogRef);
  // Focus the safe action first so Enter doesn't destroy data by accident.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
        onKeyDown={handleKeyDown}
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2
          id="confirm-title"
          className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
        >
          {title}
        </h2>
        <p
          id="confirm-description"
          className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400"
        >
          {description}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="h-9 rounded-lg border border-zinc-200 bg-white px-3.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-9 rounded-lg bg-red-600 px-3.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/40"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
