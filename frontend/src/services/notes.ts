import axios from "axios";

import type { Note, NoteInput, Paginated } from "@/types/note";

/**
 * Single axios instance for the whole app. The base URL is resolved at build
 * time from NEXT_PUBLIC_API_URL so the same code works locally and in Docker.
 */
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1",
  headers: { "Content-Type": "application/json" },
});

export interface ListNotesParams {
  search?: string;
  page?: number;
  ordering?: string;
}

/** GET /notes/ — supports DRF ?search=, ?page= and ?ordering=. */
export async function listNotes(
  params: ListNotesParams = {},
): Promise<Paginated<Note>> {
  const { data } = await api.get<Paginated<Note>>("/notes/", {
    params: {
      ...(params.search ? { search: params.search } : {}),
      ...(params.page && params.page > 1 ? { page: params.page } : {}),
      ...(params.ordering ? { ordering: params.ordering } : {}),
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
