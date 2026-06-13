import { api } from "@/services/api";
import type { Note, NoteInput, Paginated } from "@/types/note";

export interface ListNotesParams {
  search?: string;
  page?: number;
  ordering?: string;
  category?: number;
}

/** GET /notes/ — supports ?category=, DRF ?search=, ?page= and ?ordering=. */
export async function listNotes(
  params: ListNotesParams = {},
): Promise<Paginated<Note>> {
  const { data } = await api.get<Paginated<Note>>("/notes/", {
    params: {
      ...(params.search ? { search: params.search } : {}),
      ...(params.page && params.page > 1 ? { page: params.page } : {}),
      ...(params.ordering ? { ordering: params.ordering } : {}),
      ...(params.category ? { category: params.category } : {}),
    },
  });
  return data;
}

/** POST /notes/ */
export async function createNote(input: NoteInput): Promise<Note> {
  const { data } = await api.post<Note>("/notes/", input);
  return data;
}

/** PATCH /notes/:id/ */
export async function updateNote(
  id: number,
  input: Partial<NoteInput>,
): Promise<Note> {
  const { data } = await api.patch<Note>(`/notes/${id}/`, input);
  return data;
}

/** DELETE /notes/:id/ */
export async function deleteNote(id: number): Promise<void> {
  await api.delete(`/notes/${id}/`);
}
