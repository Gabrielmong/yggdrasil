"use client";

import { Box, Typography } from "@mui/material";
import { PieChart } from "@mui/x-charts/PieChart";
import { chartColors } from "@/lib/theme";

/** A titled pie chart for a small, fixed set of categories (unlike
 * ChartSection's bar/line variants, which suit open-ended, potentially
 * long category lists) — e.g. a 1-5 star rating distribution. Shows an
 * empty-state message when every count is zero. */
export default function PieChartSection({
  title,
  rows,
  emptyMessage,
}: {
  title: string;
  rows: { name: string; count: number }[];
  emptyMessage: string;
}) {
  const hasData = rows.some((r) => r.count > 0);

  return (
    <Box>
      <Typography variant="subtitle1" gutterBottom>{title}</Typography>
      {!hasData ? (
        <Typography color="text.secondary">{emptyMessage}</Typography>
      ) : (
        <PieChart
          series={[
            {
              data: rows.filter((r) => r.count > 0).map((r) => ({ id: r.name, value: r.count, label: r.name })),
              innerRadius: 40,
            },
          ]}
          colors={chartColors}
          height={300}
        />
      )}
    </Box>
  );
}
