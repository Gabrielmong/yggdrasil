const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Formats an ISO timestamp as a short relative string ("just now", "15m
 * ago", "3h ago", "2d ago"), falling back to a plain "Mon D" date once
 * it's more than a week old — same shape feed timestamps use everywhere.
 * `now` is injectable for tests; defaults to the real current time. */
export function formatRelativeTime(isoString: string, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(isoString).getTime();

  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d ago`;

  return new Date(isoString).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
