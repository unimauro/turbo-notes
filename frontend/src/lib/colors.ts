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
  // Random Thoughts
  coral: { dot: "#E0875A", bg: "#EFC2A1", border: "#D98E63" },
  // School
  yellow: { dot: "#E6C56A", bg: "#F6E3A6", border: "#E0C56A" },
  // Personal
  teal: { dot: "#7FA99B", bg: "#A9C6B9", border: "#88B0A1" },
  // Drama. The backend stores this category's color as the slug "lavender"
  // (apps/notes/models.py Color.LAVENDER), but the Figma renders Drama as an
  // OLIVE-GREEN. We map the existing "lavender" slug to the green palette here
  // so no DB migration is needed — the frontend owns the palette.
  lavender: { dot: "#A9B57E", bg: "#D6DCC1", border: "#AEBA86" },
};

const FALLBACK: CategoryPalette = CATEGORY_COLORS.coral;

/** Palette for a slug, falling back to coral for unknown values. */
export function categoryPalette(slug?: string): CategoryPalette {
  return CATEGORY_COLORS[slug as CategorySlug] ?? FALLBACK;
}
