"use client";

import { AxiosError } from "axios";
import { X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { useCreateCategory } from "@/hooks/useCategories";
import { categoryPalette } from "@/lib/colors";
import type { CategoryRef, CategorySlug } from "@/types/note";

// The slugs the backend accepts (apps/notes/models.py Color choices).
const SWATCHES: CategorySlug[] = ["coral", "yellow", "teal", "lavender"];

/** Pulls a friendly message out of a DRF 400 payload (name / color / detail). */
function errorMessage(err: unknown): string {
  if (err instanceof AxiosError && err.response?.data) {
    const data = err.response.data as Record<string, unknown>;
    const field = ["name", "color", "detail"].find((k) => data[k]);
    if (field) {
      const value = data[field];
      const text = Array.isArray(value) ? value[0] : value;
      if (typeof text === "string") return text;
    }
  }
  return "Couldn't create the category. Please try again.";
}

const inputClass =
  "h-11 w-full rounded-xl border border-ink-line bg-paper px-4 text-sm text-ink placeholder:text-ink-line focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 dark:border-linen-soft/60 dark:bg-bark dark:text-linen dark:placeholder:text-linen-soft/70";

export default function CategoryCreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  /** Called with the new category so the editor can select it immediately. */
  onCreated: (category: CategoryRef) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<CategorySlug>("coral");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateCategory();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (create.isPending) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name cannot be blank.");
      return;
    }
    setError(null);
    try {
      const category = await create.mutateAsync({ name: trimmed, color });
      onCreated(category);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4 backdrop-blur-[1px]"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cat-modal-title"
        className="w-full max-w-sm rounded-2xl border border-ink-line bg-cream p-5 shadow-xl dark:border-linen-soft/60 dark:bg-bark-soft"
      >
        <div className="flex items-center justify-between">
          <h2
            id="cat-modal-title"
            className="font-serif text-lg font-bold text-ink dark:text-linen"
          >
            Create New Category
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-ink/60 transition-colors hover:bg-ink/10 dark:text-linen/60 dark:hover:bg-linen/10"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <label htmlFor="cat-name" className="sr-only">
            Category name
          </label>
          <input
            id="cat-name"
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter name"
            maxLength={64}
            className={inputClass}
          />

          <div
            role="radiogroup"
            aria-label="Color"
            className="flex items-center gap-4 rounded-xl border border-ink-line bg-paper px-4 py-3 dark:border-linen-soft/60 dark:bg-bark"
          >
            {SWATCHES.map((slug) => (
              <button
                key={slug}
                type="button"
                role="radio"
                aria-checked={color === slug}
                aria-label={slug}
                onClick={() => setColor(slug)}
                style={{ backgroundColor: categoryPalette(slug).dot }}
                className={`h-6 w-6 rounded-full ring-offset-2 ring-offset-paper transition-transform hover:scale-110 dark:ring-offset-bark ${
                  color === slug ? "ring-2 ring-ink dark:ring-linen" : ""
                }`}
              />
            ))}
          </div>

          {error && (
            <p role="alert" className="text-sm text-[#B4543E]">
              {error}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={create.isPending}
              className="h-10 rounded-full bg-ink px-4 text-sm font-semibold text-cream transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-60"
            >
              {create.isPending ? "Creating…" : "Create Category"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
