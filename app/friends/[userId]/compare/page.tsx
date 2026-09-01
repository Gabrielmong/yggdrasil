"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Box, Typography, CircularProgress } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ChartSection from "@/components/ChartSection";
import CompatibilityScore from "@/components/compare/CompatibilityScore";
import OverlapChips from "@/components/compare/OverlapChips";
import SharedBooksList, { type SharedBookRow } from "@/components/compare/SharedBooksList";
import RecommendationsGrid, { type RecommendedBookRow } from "@/components/compare/RecommendationsGrid";

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
  yourOnlyGenres: string[];
  friendOnlyGenres: string[];
  yourOnlyAuthors: string[];
  friendOnlyAuthors: string[];
  compatibilityScore: number | null;
  sharedBooks: SharedBookRow[];
  recommendations: RecommendedBookRow[];
}

export default function CompareStatsPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const router = useRouter();
  const [stats, setStats] = useState<CompareStats | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [notFriends, setNotFriends] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/friends/${userId}/compare`).then((res) => {
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
      }),
      fetch(`/api/friends/${userId}/profile`).then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([statsData, profileData]) => {
        if (statsData) setStats(statsData);
        if (profileData) setProfileName(profileData.name ?? profileData.email);
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

  const friendName = profileName ?? "your friend";
  const series = [{ dataKey: "you", label: "You" }, { dataKey: "friend", label: friendName }];

  return (
    <Box sx={{ maxWidth: 900, mx: "auto", p: { xs: 2, md: 4 }, display: "flex", flexDirection: "column", gap: 4 }}>
      <Box>
        <Typography
          component={Link}
          href={`/friends/${userId}`}
          variant="body2"
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
            color: "text.secondary",
            textDecoration: "none",
            "&:hover": { color: "primary.main" },
          }}
        >
          <ArrowBackIcon fontSize="inherit" />
          Back to {profileName ? `${profileName}'s profile` : "profile"}
        </Typography>
        <Typography variant="h5" sx={{ mt: 1 }}>Compare</Typography>
      </Box>

      <CompatibilityScore score={stats.compatibilityScore} friendName={friendName} />

      <ChartSection title="Genres" rows={stats.genres} emptyMessage="Neither of you has any read books with genres yet." series={series} />
      <OverlapChips
        title="Genre overlap"
        shared={stats.sharedGenres}
        yourOnly={stats.yourOnlyGenres}
        friendOnly={stats.friendOnlyGenres}
        friendName={friendName}
      />

      <ChartSection title="Authors" rows={stats.authors} emptyMessage="Neither of you has any read books with authors yet." series={series} />
      <OverlapChips
        title="Author overlap"
        shared={stats.sharedAuthors}
        yourOnly={stats.yourOnlyAuthors}
        friendOnly={stats.friendOnlyAuthors}
        friendName={friendName}
      />

      <Box>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Books you&apos;ve both read</Typography>
        <SharedBooksList books={stats.sharedBooks} friendName={friendName} />
      </Box>

      <Box>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>You might like</Typography>
        <RecommendationsGrid books={stats.recommendations} friendName={friendName} />
      </Box>
    </Box>
  );
}
