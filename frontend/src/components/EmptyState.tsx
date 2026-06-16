"use client";

import { KawaiiBoba } from "@/components/Kawaii";

/** Prototype empty state: happy boba cup + a gentle invitation. */
export default function EmptyState() {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center px-6 py-24 text-center"
    >
      <KawaiiBoba className="h-32 w-32" />
      <p className="mt-6 max-w-xs text-sm text-ink dark:text-linen">
        I&apos;m just here waiting for your charming notes...
      </p>
    </div>
  );
}
