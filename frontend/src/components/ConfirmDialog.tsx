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

/** Destructive-action confirmation, restyled to the cozy palette. Mount only while open. */
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm dark:bg-black/50"
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
        className="w-full max-w-sm rounded-2xl border border-ink-line bg-cream p-6 shadow-xl dark:border-linen-soft/50 dark:bg-bark-soft"
      >
        <h2
          id="confirm-title"
          className="font-serif text-lg font-bold text-ink dark:text-linen"
        >
          {title}
        </h2>
        <p
          id="confirm-description"
          className="mt-1.5 text-sm text-ink-soft dark:text-linen-soft"
        >
          {description}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="h-10 rounded-full border border-ink-line bg-paper px-4 text-sm font-semibold text-ink transition-colors hover:bg-[#EFE3C8] dark:border-linen-soft/60 dark:bg-bark dark:text-linen dark:hover:bg-[#46382a]"
          >
            Keep it
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-10 rounded-full bg-[#B4543E] px-4 text-sm font-semibold text-cream shadow-sm transition-colors hover:bg-[#9c4836] focus:outline-none focus:ring-2 focus:ring-[#B4543E]/40"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
