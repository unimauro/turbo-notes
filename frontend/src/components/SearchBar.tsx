"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useDebounce } from "@/hooks/useDebounce";

interface SearchBarProps {
  onSearch: (term: string) => void;
  placeholder?: string;
  debounceMs?: number;
}

/**
 * Uncontrolled search input that debounces before notifying the parent, so
 * typing stays instant while the API only sees the settled value.
 */
export default function SearchBar({
  onSearch,
  placeholder = "Search notes…",
  debounceMs = 300,
}: SearchBarProps) {
  const [value, setValue] = useState("");
  const debounced = useDebounce(value, debounceMs);

  // Keep the latest callback without retriggering the debounce effect.
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  });

  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return; // don't fire for the initial empty value
    }
    onSearchRef.current(debounced);
  }, [debounced]);

  return (
    <div className="relative w-full max-w-md">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
        aria-hidden="true"
      />
      <input
        type="search"
        role="searchbox"
        aria-label="Search notes"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-8 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-600 dark:focus:ring-white/10 [&::-webkit-search-cancel-button]:hidden"
      />
      {value !== "" && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setValue("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 transition-colors hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
