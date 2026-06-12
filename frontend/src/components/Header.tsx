"use client";

import { NotebookPen, Plus } from "lucide-react";

import SearchBar from "@/components/SearchBar";
import ThemeToggle from "@/components/ThemeToggle";

interface HeaderProps {
  onSearch: (term: string) => void;
  onNewNote: () => void;
}

export default function Header({ onSearch, onNewNote }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
            <NotebookPen className="h-4 w-4" aria-hidden="true" />
          </span>
          <h1 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Turbo Notes
          </h1>
        </div>

        <div className="order-last w-full min-w-0 flex-1 sm:order-none sm:w-auto">
          <SearchBar onSearch={onSearch} />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={onNewNote}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900/30 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 dark:focus:ring-white/30"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">New note</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      </div>
    </header>
  );
}
