"use client";

import NoteCard from "@/components/NoteCard";
import type { Note } from "@/types/note";

interface NoteListProps {
  notes: Note[];
  onEdit: (note: Note) => void;
  onDelete: (note: Note) => void;
}

/** Masonry-ish responsive grid via CSS columns (cards keep natural heights). */
export default function NoteList({ notes, onEdit, onDelete }: NoteListProps) {
  return (
    <ul aria-label="Notes" className="columns-1 gap-5 sm:columns-2 xl:columns-3">
      {notes.map((note) => (
        <li key={note.id} className="mb-5 break-inside-avoid list-none">
          <NoteCard note={note} onEdit={onEdit} onDelete={onDelete} />
        </li>
      ))}
    </ul>
  );
}
