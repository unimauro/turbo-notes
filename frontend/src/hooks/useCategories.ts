"use client";

import { useQuery } from "@tanstack/react-query";

import { listCategories } from "@/services/categories";

export const categoriesKeys = {
  all: ["categories"] as const,
};

/** The four seeded categories with the caller's per-category note counts. */
export function useCategories() {
  return useQuery({
    queryKey: categoriesKeys.all,
    queryFn: listCategories,
    staleTime: 60_000,
  });
}
