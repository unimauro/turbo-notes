import type { CategorySlug } from "@/types/note";

export interface CategoryPalette {
  /** Sidebar / dropdown dot. */
  dot: string;
  /** Card + editor background tint. */
  bg: string;
  /** 1px border, darker shade of the same hue. */
  border: string;
}

/**
 * Category design tokens. The API stores only the color slug; the frontend owns
 * the palette, so a re-theme never needs a database migration.
 */
export const CATEGORY_COLORS: Record<CategorySlug, CategoryPalette> = {
  coral: { dot: "#E08D63", bg: "#F4B88F", border: "#D98E63" },
  yellow: { dot: "#E3C96E", bg: "#F8E5A3", border: "#E3C96E" },
  teal: { dot: "#6FA890", bg: "#9BC6B5", border: "#6FA890" },
  lavender: { dot: "#B49BD6", bg: "#DCCDEF", border: "#B49BD6" },
};

const FALLBACK: CategoryPalette = CATEGORY_COLORS.coral;

/** Palette for a slug, falling back to coral for unknown values. */
export function categoryPalette(slug?: string): CategoryPalette {
  return CATEGORY_COLORS[slug as CategorySlug] ?? FALLBACK;
}
