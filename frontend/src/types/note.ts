/** A note as returned by the API. */
export interface Note {
  id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

/** Payload for creating/updating a note. */
export interface NoteInput {
  title: string;
  content: string;
}

/** DRF page-number pagination envelope. */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
