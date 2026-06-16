/** Category color slug stored by the API; mapped to the pastel palette client-side. */
export type CategorySlug = "coral" | "yellow" | "teal" | "lavender";

/** Category as embedded in a note. */
export interface CategoryRef {
  id: number;
  name: string;
  color: CategorySlug;
}

/** Category as returned by GET /categories/ (includes the caller's note count). */
export interface Category extends CategoryRef {
  note_count: number;
}

/** A note as returned by the API. */
export interface Note {
  id: number;
  title: string;
  content: string;
  category: CategoryRef;
  created_at: string;
  updated_at: string;
}

/** Payload for creating/updating a note. Title may be blank (autosaved drafts). */
export interface NoteInput {
  title: string;
  content: string;
  category_id?: number;
}

/** DRF page-number pagination envelope. */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** Auth — tokens returned by POST /auth/token/. */
export interface TokenPair {
  access: string;
  refresh: string;
}

/** Auth — created user returned by POST /auth/register/. */
export interface RegisteredUser {
  id: number;
  email: string;
}

/** Auth — current user returned by GET /auth/me/. */
export interface Me {
  id: number;
  email: string;
}
