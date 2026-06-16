"use client";

import NoteCard from "@/components/NoteCard";
import type { Note } from "@/types/note";

interface NoteListProps {
  notes: Note[];
  onEdit: (note: Note) => void;
  onDelete: (note: Note) => void;
}

/**
 * Responsive grid. Cards are a fixed height (set in NoteCard), so the grid is
 * uniform regardless of content. The most-recently-written note — the one with
 * the greatest `updated_at` — gets a warm accent ring so the user can spot what
 * they just wrote.
 */
export default function NoteList({ notes, onEdit, onDelete }: NoteListProps) {
  // The "latest" note is the one with the max updated_at among the rendered
  // notes. The default sort is `-updated_at`, so it's normally the first card,
  // but we compute it explicitly so it's robust to any ordering.
  let latestId: number | null = null;
  let latestTime = -Infinity;
  for (const note of notes) {
    const t = Date.parse(note.updated_at);
    if (!Number.isNaN(t) && t > latestTime) {
      latestTime = t;
      latestId = note.id;
    }
  }

  return (
    <ul
      aria-label="Notes"
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3"
    >
      {notes.map((note) => (
        <li key={note.id} className="list-none">
          <NoteCard
            note={note}
            onEdit={onEdit}
            onDelete={onDelete}
            isLatest={note.id === latestId}
          />
        </li>
      ))}
    </ul>
  );
}
