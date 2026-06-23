"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createCategory, listCategories } from "@/services/categories";
import type { CategorySlug } from "@/types/note";

export const categoriesKeys = {
  all: ["categories"] as const,
};

/** The seeded (global) categories + the caller's own, with per-category counts. */
export function useCategories() {
  return useQuery({
    queryKey: categoriesKeys.all,
    queryFn: listCategories,
    staleTime: 60_000,
  });
}

/** Create a private category; refetch the list so it appears (with its count). */
export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, color }: { name: string; color: CategorySlug }) =>
      createCategory(name, color),
    onSuccess: () => qc.invalidateQueries({ queryKey: categoriesKeys.all }),
  });
}
