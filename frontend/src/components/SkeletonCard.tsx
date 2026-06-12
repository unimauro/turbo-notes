/** Placeholder card matching NoteCard's dimensions, for loading states. */
export default function SkeletonCard() {
  return (
    <div
      aria-hidden="true"
      className="flex h-44 animate-pulse flex-col rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="h-4 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full rounded bg-zinc-100 dark:bg-zinc-800/70" />
        <div className="h-3 w-5/6 rounded bg-zinc-100 dark:bg-zinc-800/70" />
        <div className="h-3 w-4/6 rounded bg-zinc-100 dark:bg-zinc-800/70" />
      </div>
      <div className="mt-auto h-3 w-16 rounded bg-zinc-100 dark:bg-zinc-800/70" />
    </div>
  );
}
