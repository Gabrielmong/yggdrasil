"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Box, Typography, CircularProgress, Stack, Chip } from "@mui/material";
import { BarChart } from "@mui/x-charts/BarChart";

interface CompareRow {
  name: string;
  you: number;
  friend: number;
  [key: string]: string | number;
}

interface CompareStats {
  genres: CompareRow[];
  authors: CompareRow[];
  sharedGenres: string[];
  sharedAuthors: string[];
}

const TOP_N = 12;

function ChartSection({ title, rows, emptyMessage }: { title: string; rows: CompareRow[]; emptyMessage: string }) {
  const shown = rows.slice(0, TOP_N);
  const hiddenCount = rows.length - shown.length;

  return (
    <Box>
      <Typography variant="subtitle1" gutterBottom>{title}</Typography>
      {rows.length === 0 ? (
        <Typography color="text.secondary">{emptyMessage}</Typography>
      ) : (
        <>
          <BarChart
            dataset={shown}
            xAxis={[{ dataKey: "name", scaleType: "band" }]}
            series={[{ dataKey: "you", label: "You" }, { dataKey: "friend", label: "Friend" }]}
            height={300}
          />
          {hiddenCount > 0 && (
            <Typography variant="caption" color="text.secondary">
              Showing the top {TOP_N} of {rows.length} — {hiddenCount} more not shown.
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}

export default function CompareStatsPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const router = useRouter();
  const [stats, setStats] = useState<CompareStats | null>(null);
  const [notFriends, setNotFriends] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/friends/${userId}/compare`)
      .then((res) => {
        if (res.status === 401) {
          router.push("/login");
          return null;
        }
        if (res.status === 403) {
          setNotFriends(true);
          return null;
        }
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data) => {
        if (data) setStats(data);
      })
      .catch(() => setError("Could not load comparison. Please try again later."));
  }, [userId, router]);

  if (notFriends) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="text.secondary">You&apos;re not friends with this user.</Typography>
      </Box>
    );
  }
  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }
  if (!stats) return <CircularProgress sx={{ m: 4 }} />;

  const overlap = [...stats.sharedGenres, ...stats.sharedAuthors];

  return (
    <Box sx={{ maxWidth: 800, mx: "auto", p: { xs: 2, md: 4 }, display: "flex", flexDirection: "column", gap: 4 }}>
      <Typography variant="h5">Compare</Typography>

      <ChartSection title="Genres" rows={stats.genres} emptyMessage="Neither of you has any read books with genres yet." />

      <ChartSection title="Authors" rows={stats.authors} emptyMessage="Neither of you has any read books with authors yet." />

      <Box>
        <Typography variant="subtitle1" gutterBottom>You both like</Typography>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
          {overlap.length === 0 ? (
            <Typography color="text.secondary">No overlap yet.</Typography>
          ) : (
            overlap.map((label) => <Chip key={label} label={label} size="small" />)
          )}
        </Stack>
      </Box>
    </Box>
  );
}
