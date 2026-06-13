"use client";

import { Check, ChevronDown, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useCreateNote, useUpdateNote } from "@/hooks/useNotes";
import { categoryPalette } from "@/lib/colors";
import { formatEditorTimestamp } from "@/lib/time";
import type { ListNotesParams } from "@/services/notes";
import type { Category, CategoryRef, Note, NoteInput } from "@/types/note";

export const AUTOSAVE_DELAY_MS = 800;

const FALLBACK_CATEGORY: CategoryRef = {
  id: -1,
  name: "Random Thoughts",
  color: "coral",
};

interface NoteEditorProps {
  /** Existing note to edit, or null to create a new one. */
  note: Note | null;
  categories: Category[];
  /** The board's current list params, so optimistic creates land in the right page. */
  activeParams: ListNotesParams;
  onClose: () => void;
}

/**
 * Fullscreen takeover editor per the prototype. There is NO save button:
 * changes are autosaved (debounced 800ms) — the note is created on the first
 * change and PATCHed afterwards — and any pending change is flushed on close.
 */
export default function NoteEditor({
  note,
  categories,
  activeParams,
  onClose,
}: NoteEditorProps) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const [pickedCategory, setPickedCategory] = useState<CategoryRef | undefined>(
    note?.category,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(
    note?.updated_at ?? null,
  );
  const [openedAt] = useState(() => new Date().toISOString());

  // Derived (no effect needed): user pick > note's category > seeded default.
  const category =
    pickedCategory ??
    categories.find((c) => c.name === "Random Thoughts") ??
    categories[0];

  const createMutation = useCreateNote(activeParams);
  const updateMutation = useUpdateNote();

  // ---- autosave machinery -------------------------------------------------
  // Refs are only written inside event handlers / async callbacks, never
  // during render (React Compiler rule).
  const idRef = useRef<number | null>(note?.id ?? null);
  const dirtyRef = useRef(false);
  const busyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<{
    title: string;
    content: string;
    category: CategoryRef | undefined;
  }>({ title: note?.title ?? "", content: note?.content ?? "", category });

  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (busyRef.current) return; // the running loop below picks up new changes

    busyRef.current = true;
    try {
      while (dirtyRef.current) {
        dirtyRef.current = false;
        const snapshot = latestRef.current;
        const input: NoteInput = {
          title: snapshot.title,
          content: snapshot.content,
          ...(snapshot.category && snapshot.category.id > 0
            ? { category_id: snapshot.category.id }
            : {}),
        };
        try {
          if (idRef.current == null) {
            const created = await createMutation.mutateAsync({
              input,
              category: snapshot.category ?? FALLBACK_CATEGORY,
            });
            idRef.current = created.id;
            setLastSavedAt(created.updated_at);
          } else {
            const updated = await updateMutation.mutateAsync({
              id: idRef.current,
              input,
              category: snapshot.category,
            });
            setLastSavedAt(updated.updated_at);
          }
        } catch {
          dirtyRef.current = true; // retried on the next change/close
          break;
        }
      }
    } finally {
      busyRef.current = false;
    }
  }, [createMutation, updateMutation]);

  const scheduleSave = useCallback(
    (snapshot: { title: string; content: string; category: CategoryRef | undefined }) => {
      latestRef.current = snapshot;
      dirtyRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void flush();
      }, AUTOSAVE_DELAY_MS);
    },
    [flush],
  );

  // Clear any pending timer on unmount (close already flushed).
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function handleClose() {
    void flush(); // mutations outlive the unmount via the query client
    onClose();
  }

  // ---- UI -----------------------------------------------------------------
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  useFocusTrap(containerRef);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    if (menuOpen) {
      setMenuOpen(false);
    } else {
      handleClose();
    }
  }

  const palette = categoryPalette(category?.color);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={note ? "Edit note" : "New note"}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-40 flex flex-col bg-cream px-4 py-4 sm:px-8 sm:py-6 dark:bg-bark"
    >
      <header className="flex items-center justify-between">
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-ink-line bg-paper px-4 text-sm font-semibold text-ink transition-colors hover:bg-[#EFE3C8] dark:border-linen-soft/60 dark:bg-bark-soft dark:text-linen dark:hover:bg-[#46382a]"
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: palette.dot }}
            />
            {category?.name ?? "Category"}
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>

          {menuOpen && (
            <>
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
              <ul
                role="listbox"
                aria-label="Category"
                className="absolute left-0 z-20 mt-2 w-56 rounded-xl border border-ink-line bg-paper p-1.5 shadow-lg dark:border-linen-soft/60 dark:bg-bark-soft"
              >
                {categories.map((c) => {
                  const cPalette = categoryPalette(c.color);
                  const selected = category?.id === c.id;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          setPickedCategory(c);
                          setMenuOpen(false);
                          // Recolors instantly, persists shortly after.
                          scheduleSave({ title, content, category: c });
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-ink/10 dark:text-linen dark:hover:bg-linen/10"
                      >
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: cPalette.dot }}
                        />
                        <span className="flex-1">{c.name}</span>
                        {selected && (
                          <Check className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={handleClose}
          aria-label="Close editor"
          className="rounded-full p-2 text-ink transition-colors hover:bg-ink/10 dark:text-linen dark:hover:bg-linen/10"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      <div
        style={{ backgroundColor: palette.bg, borderColor: palette.border }}
        className="tinted mt-4 flex min-h-0 flex-1 flex-col rounded-2xl border p-6 sm:p-10"
      >
        <p className="text-right text-xs text-ink/70">
          Last Edited: {formatEditorTimestamp(lastSavedAt ?? openedAt)}
        </p>

        <label htmlFor="editor-title" className="sr-only">
          Note title
        </label>
        <input
          id="editor-title"
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            scheduleSave({ title: e.target.value, content, category });
          }}
          placeholder="Note Title"
          className="mt-3 w-full bg-transparent font-serif text-3xl font-bold text-ink placeholder:text-ink/40 focus:outline-none"
        />

        <label htmlFor="editor-content" className="sr-only">
          Note content
        </label>
        <textarea
          id="editor-content"
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            scheduleSave({ title, content: e.target.value, category });
          }}
          placeholder="Pour your heart out..."
          className="mt-5 w-full flex-1 resize-none bg-transparent text-base leading-relaxed text-ink-soft placeholder:text-ink/35 focus:outline-none"
        />
      </div>
    </div>
  );
}
