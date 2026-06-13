/** Placeholder card matching NoteCard's look, for loading states. */
export default function SkeletonCard() {
  return (
    <div
      aria-hidden="true"
      className="flex h-44 animate-pulse flex-col rounded-xl border border-ink-line/25 bg-paper p-5 dark:border-linen-soft/25 dark:bg-bark-soft"
    >
      <div className="h-3 w-24 rounded bg-ink/10 dark:bg-linen/10" />
      <div className="mt-3 h-5 w-2/3 rounded bg-ink/15 dark:bg-linen/15" />
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full rounded bg-ink/10 dark:bg-linen/10" />
        <div className="h-3 w-5/6 rounded bg-ink/10 dark:bg-linen/10" />
        <div className="h-3 w-4/6 rounded bg-ink/10 dark:bg-linen/10" />
      </div>
    </div>
  );
}
