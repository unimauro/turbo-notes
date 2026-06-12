"use client";

import { Trash2 } from "lucide-react";
import type { KeyboardEvent } from "react";

import { formatRelativeTime } from "@/lib/time";
import type { Note } from "@/types/note";

interface NoteCardProps {
  note: Note;
  onEdit: (note: Note) => void;
  onDelete: (note: Note) => void;
}

/**
 * The whole card opens the editor. The delete action is a separate button
 * (not nested inside another interactive element) for valid a11y semantics.
 */
export default function NoteCard({ note, onEdit, onDelete }: NoteCardProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onEdit(note);
    }
  }

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Edit note: ${note.title}`}
      onClick={() => onEdit(note)}
      onKeyDown={handleKeyDown}
      className="group relative flex h-44 cursor-pointer flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-zinc-900/20 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:focus:ring-white/20"
    >
      <h3 className="line-clamp-1 pr-8 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {note.title}
      </h3>
      <p className="mt-1.5 line-clamp-4 flex-1 whitespace-pre-line text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
        {note.content || "No content"}
      </p>
      <footer className="mt-3 flex items-center justify-between">
        <time
          dateTime={note.updated_at}
          className="text-xs text-zinc-400 dark:text-zinc-500"
        >
          {formatRelativeTime(note.updated_at)}
        </time>
      </footer>

      <button
        type="button"
        aria-label={`Delete note: ${note.title}`}
        onClick={(e) => {
          e.stopPropagation(); // don't open the editor
          onDelete(note);
        }}
        className="absolute right-3 top-3 rounded-md p-1.5 text-zinc-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-500/30 group-hover:opacity-100 dark:text-zinc-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </article>
  );
}
