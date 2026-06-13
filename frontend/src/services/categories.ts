import { api } from "@/services/api";
import type { Category } from "@/types/note";

/** GET /categories/ — not paginated; note_count covers only the caller's notes. */
export async function listCategories(): Promise<Category[]> {
  const { data } = await api.get<Category[]>("/categories/");
  return data;
}
