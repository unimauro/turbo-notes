"use client";

import { LogOut } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { useMe } from "@/hooks/useMe";

interface ProfileMenuProps {
  /** Called when the user picks "Log out". */
  onLogout: () => void;
}

/**
 * Avatar button (user's initial) that opens a cozy dropdown showing the
 * account email and a "Log out" action. Closes on Escape, click-outside,
 * or after logging out.
 */
export default function ProfileMenu({ onLogout }: ProfileMenuProps) {
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const email = me?.email ?? "";
  const initial = (email.trim()[0] ?? "?").toUpperCase();

  // Close on Escape and on click/focus outside the menu container.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointerDown(e: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  function handleLogout() {
    setOpen(false);
    onLogout();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Account menu"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink-line bg-[#EFE3C8] text-sm font-semibold text-ink transition-colors hover:bg-[#E6D6B4] focus:outline-none focus:ring-2 focus:ring-ink/20 dark:border-linen-soft/60 dark:bg-bark-soft dark:text-linen dark:hover:bg-[#46382a]"
      >
        {initial}
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className="fade-in absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-2xl border border-ink-line bg-cream shadow-xl dark:border-linen-soft/50 dark:bg-bark-soft"
        >
          <div className="px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-ink-line dark:text-linen-soft/70">
              Signed in as
            </p>
            <p
              className="mt-0.5 truncate text-sm text-ink-soft dark:text-linen-soft"
              title={email}
            >
              {email}
            </p>
          </div>
          <div className="h-px bg-ink-line/60 dark:bg-linen-soft/30" />
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-ink transition-colors hover:bg-[#EFE3C8] focus:bg-[#EFE3C8] focus:outline-none dark:text-linen dark:hover:bg-[#46382a] dark:focus:bg-[#46382a]"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
