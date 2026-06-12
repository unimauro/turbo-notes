"use client";

import NoteCard from "@/components/NoteCard";
import type { Note } from "@/types/note";

interface NoteListProps {
  notes: Note[];
  onEdit: (note: Note) => void;
  onDelete: (note: Note) => void;
}

export default function NoteList({ notes, onEdit, onDelete }: NoteListProps) {
  return (
    <ul
      aria-label="Notes"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {notes.map((note) => (
        <li key={note.id} className="list-none">
          <NoteCard note={note} onEdit={onEdit} onDelete={onDelete} />
        </li>
      ))}
    </ul>
  );
}
