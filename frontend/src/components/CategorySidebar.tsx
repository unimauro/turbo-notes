"use client";

import { categoryPalette } from "@/lib/colors";
import type { Category } from "@/types/note";

interface CategorySidebarProps {
  categories: Category[];
  /** null = no filter ("All Categories"). */
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}

/**
 * Text-only sidebar per the prototype: "All Categories" heading (clears the
 * filter) and one row per category — colored dot, name, count at the right.
 * Counts are hidden when zero, matching the empty-state frames.
 */
export default function CategorySidebar({
  categories,
  selectedId,
  onSelect,
}: CategorySidebarProps) {
  return (
    <nav aria-label="Categories" className="w-full md:w-52 md:shrink-0">
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={selectedId === null}
        className={`text-sm font-bold text-ink transition-opacity hover:opacity-70 dark:text-linen ${
          selectedId === null ? "" : "opacity-80"
        }`}
      >
        All Categories
      </button>

      <ul className="mt-3 space-y-2">
        {categories.map((category) => {
          const palette = categoryPalette(category.color);
          const isActive = selectedId === category.id;
          return (
            <li key={category.id}>
              <button
                type="button"
                onClick={() => onSelect(isActive ? null : category.id)}
                aria-pressed={isActive}
                className={`flex w-full items-center gap-2.5 rounded-lg px-1 py-0.5 text-left text-sm transition-colors ${
                  isActive
                    ? "font-semibold text-ink dark:text-linen"
                    : "text-ink-soft hover:text-ink dark:text-linen-soft dark:hover:text-linen"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: palette.dot }}
                />
                <span className="min-w-0 flex-1 truncate">{category.name}</span>
                {category.note_count > 0 && (
                  <span className="text-xs tabular-nums text-ink-line dark:text-linen-soft">
                    {category.note_count}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
