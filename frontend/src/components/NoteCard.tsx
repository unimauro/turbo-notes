"use client";

import { Trash2 } from "lucide-react";
import type { KeyboardEvent } from "react";

import { categoryPalette } from "@/lib/colors";
import { formatCardDate } from "@/lib/time";
import type { Note } from "@/types/note";

interface NoteCardProps {
  note: Note;
  onEdit: (note: Note) => void;
  onDelete: (note: Note) => void;
  /** The most-recently-written note (max updated_at) gets a warm accent ring. */
  isLatest?: boolean;
}

/**
 * Category-tinted card per the prototype: meta line (bold relative date +
 * category name), serif title, clamped content preview. Every card is a fixed
 * height (h-72) so the grid stays uniform regardless of content length; the
 * title clamps to 3 lines and the content fills the remaining space, clamping
 * with ellipsis. The whole card opens the editor; delete is a separate
 * hover-revealed button so the semantics stay valid for assistive tech.
 */
export default function NoteCard({
  note,
  onEdit,
  onDelete,
  isLatest = false,
}: NoteCardProps) {
  const palette = categoryPalette(note.category?.color);
  const displayTitle = note.title.trim() || "Untitled";

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
      aria-label={`Edit note: ${displayTitle}`}
      onClick={() => onEdit(note)}
      onKeyDown={handleKeyDown}
      style={{ backgroundColor: palette.bg, borderColor: palette.border }}
      className={`tinted group relative flex h-72 cursor-pointer flex-col overflow-hidden rounded-xl border p-5 transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-ink/30 ${
        isLatest
          ? "board-pop ring-2 ring-amber-400/80 ring-offset-2 ring-offset-cream dark:ring-offset-bark"
          : ""
      }`}
    >
      {isLatest && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink shadow-sm group-hover:opacity-0"
        >
          Latest
        </span>
      )}

      <p className="text-xs text-ink/80">
        <span className="font-bold">{formatCardDate(note.updated_at)}</span>
        {note.category?.name && <span className="ml-2">{note.category.name}</span>}
      </p>

      <h3 className="mt-2 line-clamp-3 break-words pr-6 font-serif text-xl font-bold leading-snug text-ink">
        {displayTitle}
      </h3>

      {note.content && (
        <p className="mt-2 line-clamp-5 flex-1 overflow-hidden whitespace-pre-line text-sm leading-relaxed text-ink-soft">
          {note.content}
        </p>
      )}

      <button
        type="button"
        aria-label={`Delete note: ${displayTitle}`}
        onClick={(e) => {
          e.stopPropagation(); // don't open the editor
          onDelete(note);
        }}
        className="absolute right-3 top-3 rounded-md p-1.5 text-ink/50 opacity-0 transition-all hover:bg-ink/10 hover:text-ink focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ink/30 group-hover:opacity-100"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </article>
  );
}
