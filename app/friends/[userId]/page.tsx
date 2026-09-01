"use client";

import { useEffect, useState, use, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Box, Typography, CircularProgress, Tabs, Tab, Button, ButtonBase, Paper } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import BookCard from "@/components/BookCard";
import BookCarousel from "@/components/BookCarousel";
import ProfileHero from "@/components/ProfileHero";
import PersonalStatsCharts from "@/components/PersonalStatsCharts";
import PopularChips from "@/components/PopularChips";
import { resolveImageUrl } from "@/lib/storage/resolveImageUrl";
import { getStatChipSx, getStatChipHoverSx } from "@/lib/statChipStyle";
import { buildStatCounters } from "@/lib/stats/statCounters";
import { displayInitial } from "@/lib/displayName";
import type { PersonalStats } from "@/lib/stats/personalStats";

interface FriendUserBook {
  id: string;
  status: "WANT_TO_READ" | "READING" | "READ";
  rating: number | null;
  book: { id: string; title: string; authors: string[]; coverUrl: string | null; coverImageId: string | null };
}

interface FriendProfile {
  id: string;
  name: string | null;
  image: string | null;
  avatarImageId: string | null;
  createdAt: string;
}

interface FriendCompareStats {
  you: PersonalStats;
  friend: PersonalStats;
}

const TABS: { label: string; status: FriendUserBook["status"] | "ALL" }[] = [
  { label: "All", status: "ALL" },
  { label: "Want to Read", status: "WANT_TO_READ" },
  { label: "Reading", status: "READING" },
  { label: "Read", status: "READ" },
];

const STAT_TABS: { label: string; status: FriendUserBook["status"] }[] = [
  { label: "Want to Read", status: "WANT_TO_READ" },
  { label: "Reading", status: "READING" },
  { label: "Read", status: "READ" },
];

export default function FriendShelfPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const router = useRouter();
  const theme = useTheme();
  const [books, setBooks] = useState<FriendUserBook[] | null>(null);
  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [compareStats, setCompareStats] = useState<FriendCompareStats | null>(null);
  const [notFriends, setNotFriends] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    Promise.all([
      fetch(`/api/friends/${userId}/books`).then((res) => {
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
      fetch(`/api/friends/${userId}/stats`).then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([booksData, profileData, statsData]) => {
        if (booksData) setBooks(booksData);
        if (profileData) setProfile(profileData);
        setCompareStats(statsData);
      })
      .catch(() => setError("Could not load this shelf. Please try again later."));
  }, [userId, router]);

  const statCounts = useMemo(() => {
    const counts: Record<FriendUserBook["status"], number> = { WANT_TO_READ: 0, READING: 0, READ: 0 };
    for (const ub of books ?? []) counts[ub.status] += 1;
    return counts;
  }, [books]);

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
  if (!books) return <CircularProgress sx={{ m: 4 }} />;

  const activeStatus = TABS[tab].status;
  const filtered = activeStatus === "ALL" ? books : books.filter((ub) => ub.status === activeStatus);
  const avatarUrl = profile ? resolveImageUrl(profile.avatarImageId, profile.image, "sm", "profilepictures") : null;
  const statChipSx = getStatChipSx(theme);

  const friendName = profile?.name ?? "Your friend";
  const yourCounters = compareStats ? buildStatCounters(compareStats.you) : [];
  const friendCounters = compareStats ? buildStatCounters(compareStats.friend) : [];

  return (
    <Box
      sx={{
        maxWidth: 1200,
        mx: "auto",
        p: { xs: 2, md: 4 },
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "360px 1fr" },
        gap: 4,
        alignItems: "start",
      }}
    >
      <Box sx={{ position: { md: "sticky" }, top: { md: 88 }, display: "flex", flexDirection: "column", gap: 3 }}>
        {profile && (
          <ProfileHero
            avatarUrl={avatarUrl}
            fallbackInitial={displayInitial(profile.name)}
            name={profile.name}
            createdAt={profile.createdAt}
          >
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.5, mt: 3, maxWidth: 360, mx: "auto" }}>
              {STAT_TABS.map((stat) => (
                <ButtonBase
                  key={stat.status}
                  onClick={() => setTab(TABS.findIndex((t) => t.status === stat.status))}
                  sx={{ ...statChipSx, minWidth: 0, "&:hover": getStatChipHoverSx(theme) }}
                >
                  <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1, color: "primary.main" }}>
                    {statCounts[stat.status]}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {stat.label}
                  </Typography>
                </ButtonBase>
              ))}
            </Box>
          </ProfileHero>
        )}

        {compareStats && (
          <PopularChips genres={compareStats.friend.shelfGenreFrequency} authors={compareStats.friend.shelfAuthorFrequency} />
        )}
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {compareStats && (
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              You vs {friendName}
            </Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, gap: 2 }}>
              <Paper sx={{ p: 3, borderRadius: 3, textAlign: "center" }}>
                <Typography variant="overline" color="text.secondary">You</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1.5, mt: 1 }}>
                  {yourCounters.map((counter) => (
                    <Box key={counter.label} sx={{ ...statChipSx, minWidth: 0 }}>
                      <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1, color: "primary.main" }}>
                        {counter.value}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">{counter.label}</Typography>
                    </Box>
                  ))}
                </Box>
              </Paper>
              <Paper sx={{ p: 3, borderRadius: 3, textAlign: "center" }}>
                <Typography variant="overline" color="text.secondary">{friendName}</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1.5, mt: 1 }}>
                  {friendCounters.map((counter) => (
                    <Box key={counter.label} sx={{ ...statChipSx, minWidth: 0 }}>
                      <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1, color: "primary.main" }}>
                        {counter.value}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">{counter.label}</Typography>
                    </Box>
                  ))}
                </Box>
              </Paper>
            </Box>
          </Box>
        )}

        <Box>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 2, mb: 2 }}>
            <Tabs value={tab} onChange={(_, v: number) => setTab(v)}>
              {TABS.map((t) => (
                <Tab key={t.status} label={t.label} />
              ))}
            </Tabs>
            <Button variant="outlined" component={Link} href={`/friends/${userId}/compare`}>
              Compare genres &amp; authors
            </Button>
          </Box>
          {filtered.length === 0 ? (
            <Typography color="text.secondary">No books here yet.</Typography>
          ) : (
            <BookCarousel>
              {filtered.map((ub) => (
                <BookCard
                  key={ub.id}
                  userBook={{ ...ub, book: { ...ub.book, coverUrl: resolveImageUrl(ub.book.coverImageId, ub.book.coverUrl, "sm", "covers") } }}
                />
              ))}
            </BookCarousel>
          )}
        </Box>

        {compareStats && (
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              {friendName} Reading Stats
            </Typography>
            <PersonalStatsCharts stats={compareStats.friend} statChipSx={statChipSx} name={friendName} />
          </Box>
        )}
      </Box>
    </Box>
  );
}
