import type { PersonalStats } from "@/lib/stats/personalStats";

export interface StatCounter {
  label: string;
  value: string;
}

/** The simple "number + label" counters shown for a set of personal stats —
 * shared between the full PersonalStatsCharts view and the friend page's
 * side-by-side "You vs Friend" comparison, so both places describe the same
 * six numbers the same way. */
export function buildStatCounters(stats: PersonalStats): StatCounter[] {
  return [
    { label: "Books read", value: stats.totalBooksRead.toLocaleString() },
    { label: "Pages read", value: stats.totalPagesRead.toLocaleString() },
    { label: "On the shelf", value: stats.totalBooksOnShelf.toLocaleString() },
    { label: "Authors read", value: stats.distinctAuthorCount.toLocaleString() },
    { label: "Genres read", value: stats.distinctGenreCount.toLocaleString() },
    { label: "Avg rating", value: stats.averageRating != null ? `${stats.averageRating}★` : "—" },
  ];
}
