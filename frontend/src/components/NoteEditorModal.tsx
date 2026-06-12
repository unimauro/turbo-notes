"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { useFocusTrap } from "@/hooks/useFocusTrap";
import type { Note, NoteInput } from "@/types/note";

interface NoteEditorModalProps {
  /** Existing note to edit, or null to create a new one. */
  note: Note | null;
  onSave: (input: NoteInput) => void;
  onClose: () => void;
}

/**
 * Create/edit dialog. Mount it only while open (parent controls visibility,
 * keyed by note id) so internal state always starts fresh.
 *
 * Keyboard: Escape closes · Cmd/Ctrl+Enter saves.
 */
export default function NoteEditorModal({
  note,
  onSave,
  onClose,
}: NoteEditorModalProps) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.content ?? "");

  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useFocusTrap(dialogRef);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const canSave = title.trim().length > 0;

  function handleSave() {
    if (!canSave) return;
    onSave({ title: title.trim(), content });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose(); // backdrop click
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-editor-title"
        onKeyDown={handleKeyDown}
        className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
          <h2
            id="note-editor-title"
            className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
          >
            {note ? "Edit note" : "New note"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <form
          className="space-y-4 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <div>
            <label
              htmlFor="note-title"
              className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400"
            >
              Title
            </label>
            <input
              id="note-title"
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Untitled"
              required
              className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-white/10"
            />
          </div>

          <div>
            <label
              htmlFor="note-content"
              className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400"
            >
              Content
            </label>
            <textarea
              id="note-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write something…"
              rows={8}
              className="w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-white/10"
            />
          </div>

          <footer className="flex items-center justify-between pt-1">
            <span className="hidden text-xs text-zinc-400 dark:text-zinc-500 sm:block">
              <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 font-sans dark:border-zinc-700 dark:bg-zinc-800">
                ⌘↵
              </kbd>{" "}
              to save ·{" "}
              <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 font-sans dark:border-zinc-700 dark:bg-zinc-800">
                Esc
              </kbd>{" "}
              to close
            </span>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-lg border border-zinc-200 bg-white px-3.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSave}
                className="h-9 rounded-lg bg-zinc-900 px-3.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {note ? "Save changes" : "Create note"}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
