const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Card meta date per the prototype: "today", "yesterday", else "July 16"
 * (with the year appended only when it differs from the current one).
 */
export function formatCardDate(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  if (isSameDay(then, now)) return "today";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(then, yesterday)) return "yesterday";

  const base = `${MONTHS[then.getMonth()]} ${then.getDate()}`;
  return then.getFullYear() === now.getFullYear()
    ? base
    : `${base}, ${then.getFullYear()}`;
}

/** Editor timestamp per the prototype: "July 21, 2024 at 8:39pm". */
export function formatEditorTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const hours24 = d.getHours();
  const meridiem = hours24 >= 12 ? "pm" : "am";
  const hours12 = hours24 % 12 || 12;
  const minutes = String(d.getMinutes()).padStart(2, "0");

  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} at ${hours12}:${minutes}${meridiem}`;
}
