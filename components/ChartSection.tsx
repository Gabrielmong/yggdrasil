"use client";

import { Box, Typography } from "@mui/material";
import { BarChart } from "@mui/x-charts/BarChart";
import { LineChart } from "@mui/x-charts/LineChart";
import { chartColors } from "@/lib/theme";

const DEFAULT_TOP_N = 12;

/** A titled bar or line chart capped to the top N rows (by whatever order
 * the caller already sorted `rows` in), with a caption noting how many
 * more aren't shown when truncated, and an empty-state message when
 * there's nothing to chart. Shared by the friend-comparison page (two
 * series, "You"/"Friend", always bars) and the personal stats charts
 * (one series each, mixing bar and line by data shape). */
export default function ChartSection({
  title,
  rows,
  emptyMessage,
  series,
  xAxisKey = "name",
  topN = DEFAULT_TOP_N,
  variant = "bar",
}: {
  title: string;
  rows: Record<string, string | number>[];
  emptyMessage: string;
  series: { dataKey: string; label: string }[];
  xAxisKey?: string;
  topN?: number;
  variant?: "bar" | "line";
}) {
  const shown = rows.slice(0, topN);
  const hiddenCount = rows.length - shown.length;
  const Chart = variant === "line" ? LineChart : BarChart;

  return (
    <Box>
      <Typography variant="subtitle1" gutterBottom>{title}</Typography>
      {rows.length === 0 ? (
        <Typography color="text.secondary">{emptyMessage}</Typography>
      ) : (
        <>
          <Chart
            dataset={shown}
            xAxis={[{ dataKey: xAxisKey, scaleType: variant === "line" ? "point" : "band" }]}
            series={series}
            colors={chartColors}
            height={300}
          />
          {hiddenCount > 0 && (
            <Typography variant="caption" color="text.secondary">
              Showing the top {topN} of {rows.length} — {hiddenCount} more not shown.
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}
