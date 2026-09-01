"use client";

import { Box, Typography, ButtonBase, Paper, type SxProps, type Theme } from "@mui/material";
import ChartSection from "@/components/ChartSection";
import PieChartSection from "@/components/PieChartSection";
import type { PersonalStats } from "@/lib/stats/personalStats";
import { buildStatCounters } from "@/lib/stats/statCounters";

const RATING_LABELS: Record<number, string> = { 1: "★", 2: "★★", 3: "★★★", 4: "★★★★", 5: "★★★★★" };

/** Personal reading stats/charts for the profile page: total counters,
 * genre/author frequency, books finished per month, average rating by
 * genre, and rating distribution — all computed from the user's READ
 * books only. Renders nothing extra when a chart has no data (each
 * ChartSection shows its own empty message). Charts lay out as a
 * responsive grid of cards rather than one long stacked column.
 *
 * This component is shared by the profile page (own stats, `name="You"`)
 * and a friend's page (`name` is the friend's display name) — empty-state
 * copy is built from `name` so it reads correctly in both places, e.g.
 * "You haven't rated any books yet." vs "Alex hasn't rated any books yet." */
export default function PersonalStatsCharts({
  stats,
  statChipSx,
  name,
}: {
  stats: PersonalStats;
  statChipSx: SxProps<Theme>;
  name: string;
}) {
  const verb = name === "You" ? "haven't" : "hasn't";
  const ratingRows = stats.ratingDistribution.map((r) => ({ name: RATING_LABELS[r.rating] ?? String(r.rating), count: r.count }));
  const avgRatingRows = stats.avgRatingByGenre.map((r) => ({ name: r.name, avgRating: r.avgRating }));

  // booksOverTime is sorted oldest-first — for a trend chart, truncating
  // should keep the most RECENT months, not the oldest, so slice from the
  // end here rather than relying on ChartSection's default keep-the-front
  // truncation (which suits count-sorted-descending frequency lists).
  const MAX_MONTHS_SHOWN = 24;
  const recentMonths = stats.booksOverTime.slice(-MAX_MONTHS_SHOWN);
  const booksOverTimeRows = recentMonths.map((m) => ({ name: m.month, count: m.count }));

  const charts = [
    {
      key: "genres",
      title: "Genres",
      rows: stats.genreFrequency,
      emptyMessage: `${name} ${verb} read any books yet.`,
      series: [{ dataKey: "count", label: "Books" }],
    },
    {
      key: "authors",
      title: "Top authors",
      rows: stats.authorFrequency,
      emptyMessage: `${name} ${verb} read any books yet.`,
      series: [{ dataKey: "count", label: "Books" }],
    },
    {
      key: "overTime",
      title: "Books read over time",
      rows: booksOverTimeRows,
      emptyMessage: `${name} ${verb} finished any books yet.`,
      series: [{ dataKey: "count", label: "Books finished" }],
      topN: MAX_MONTHS_SHOWN,
      variant: "line" as const,
    },
    {
      key: "ratingByGenre",
      title: "Average rating by genre",
      rows: avgRatingRows,
      emptyMessage: `${name} ${verb} rated any books yet.`,
      series: [{ dataKey: "avgRating", label: "Avg rating" }],
    },
  ];

  const counters = buildStatCounters(stats);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(3, 1fr)", sm: "repeat(6, 1fr)" }, gap: 1.5 }}>
        {counters.map((counter) => (
          <ButtonBase key={counter.label} sx={{ ...statChipSx, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1, color: "primary.main" }}>{counter.value}</Typography>
            <Typography variant="caption" color="text.secondary">{counter.label}</Typography>
          </ButtonBase>
        ))}
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" },
          gap: 3,
        }}
      >
        {charts.map((chart) => (
          <Paper key={chart.key} sx={{ p: 3, borderRadius: 3 }}>
            <ChartSection
              title={chart.title}
              rows={chart.rows}
              emptyMessage={chart.emptyMessage}
              series={chart.series}
              topN={chart.topN}
              variant={chart.variant}
            />
          </Paper>
        ))}
        <Paper sx={{ p: 3, borderRadius: 3 }}>
          <PieChartSection
            title="Rating distribution"
            rows={ratingRows}
            emptyMessage={`${name} ${verb} rated any books yet.`}
          />
        </Paper>
      </Box>
    </Box>
  );
}
