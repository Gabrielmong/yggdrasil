"use client";

import { useEffect, useState, use, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Box, Typography, CircularProgress, Tabs, Tab, Button, Paper, Avatar, Stack, ButtonBase } from "@mui/material";
import BookCard from "@/components/BookCard";
import { resolveImageUrl } from "@/lib/storage/resolveImageUrl";

interface FriendUserBook {
  id: string;
  status: "WANT_TO_READ" | "READING" | "READ";
  rating: number | null;
  book: { id: string; title: string; authors: string[]; coverUrl: string | null; coverImageId: string | null };
}

interface FriendProfile {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  avatarImageId: string | null;
  createdAt: string;
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

function memberSince(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export default function FriendShelfPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const router = useRouter();
  const [books, setBooks] = useState<FriendUserBook[] | null>(null);
  const [profile, setProfile] = useState<FriendProfile | null>(null);
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
    ])
      .then(([booksData, profileData]) => {
        if (booksData) setBooks(booksData);
        if (profileData) setProfile(profileData);
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

  return (
    <Box sx={{ p: 4, maxWidth: 900, mx: "auto" }}>
      {profile && (
        <Paper sx={{ p: { xs: 3, md: 4 }, mb: 4, textAlign: "center", borderRadius: 3 }}>
          <Avatar src={avatarUrl ?? undefined} sx={{ width: 96, height: 96, mx: "auto", mb: 2, fontSize: 36 }}>
            {profile.name?.[0] ?? profile.email[0]}
          </Avatar>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            {profile.name ?? "Reader"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {profile.email}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            Member since {memberSince(profile.createdAt)}
          </Typography>
          <Stack direction="row" spacing={1.5} sx={{ mt: 3, flexWrap: "wrap", justifyContent: "center" }}>
            {STAT_TABS.map((stat) => (
              <ButtonBase
                key={stat.status}
                onClick={() => setTab(TABS.findIndex((t) => t.status === stat.status))}
                sx={{
                  px: 2.5,
                  py: 1.5,
                  borderRadius: 2,
                  bgcolor: "action.hover",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  minWidth: 96,
                  "&:hover": { bgcolor: "action.selected" },
                }}
              >
                <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1 }}>
                  {statCounts[stat.status]}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {stat.label}
                </Typography>
              </ButtonBase>
            ))}
          </Stack>
        </Paper>
      )}

      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3, flexWrap: "wrap", gap: 2 }}>
        <Tabs value={tab} onChange={(_, v: number) => setTab(v)}>
          {TABS.map((t) => (
            <Tab key={t.status} label={t.label} />
          ))}
        </Tabs>
        <Button variant="outlined" component={Link} href={`/friends/${userId}/compare`}>
          Compare
        </Button>
      </Box>
      {filtered.length === 0 ? (
        <Typography color="text.secondary">No books here yet.</Typography>
      ) : (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
          {filtered.map((ub) => (
            <BookCard
              key={ub.id}
              userBook={{ ...ub, book: { ...ub.book, coverUrl: resolveImageUrl(ub.book.coverImageId, ub.book.coverUrl, "sm", "covers") } }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
