"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

/**
 * Class-strategy dark mode toggle. The initial class is applied by an inline
 * script in the root layout (before paint, so no flash); this component only
 * reads/toggles it and persists the choice.
 *
 * The <html> class is the single source of truth, observed via
 * useSyncExternalStore — no mounted-flag effects, no hydration mismatch.
 */

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): boolean {
  return document.documentElement.classList.contains("dark");
}

// Server snapshot: light by default; the client corrects right after hydration.
function getServerSnapshot(): boolean {
  return false;
}

export default function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // localStorage unavailable (private mode) — theme just won't persist.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-line transition-colors hover:bg-ink/10 hover:text-ink dark:text-linen-soft dark:hover:bg-linen/10 dark:hover:text-linen"
    >
      {isDark ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}
