import { api } from "@/services/api";
import type { Category, CategoryRef, CategorySlug } from "@/types/note";

/** GET /categories/ — not paginated; note_count covers only the caller's notes. */
export async function listCategories(): Promise<Category[]> {
  const { data } = await api.get<Category[]>("/categories/");
  return data;
}

/**
 * POST /categories/ — create a private (per-user) category.
 * Returns the created `{id, name, color}` (note_count comes from the next list
 * fetch). A duplicate name or invalid color surfaces as a 400.
 */
export async function createCategory(
  name: string,
  color: CategorySlug,
): Promise<CategoryRef> {
  const { data } = await api.post<CategoryRef>("/categories/", { name, color });
  return data;
}
