"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Typography,
  CircularProgress,
  Button,
  Stack,
  ButtonBase,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import Link from "next/link";
import ImageUploadButton from "@/components/ImageUploadButton";
import PersonalStatsCharts from "@/components/PersonalStatsCharts";
import ProfileHero from "@/components/ProfileHero";
import { resolveImageUrl } from "@/lib/storage/resolveImageUrl";
import { getStatChipSx, getStatChipHoverSx } from "@/lib/statChipStyle";
import type { PersonalStats } from "@/lib/stats/personalStats";

interface Profile {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  avatarImageId: string | null;
  createdAt: string;
}

interface UserBook {
  status: "WANT_TO_READ" | "READING" | "READ";
}

const STAT_TABS: { label: string; status: UserBook["status"] }[] = [
  { label: "Want to Read", status: "WANT_TO_READ" },
  { label: "Reading", status: "READING" },
  { label: "Read", status: "READ" },
];

export default function ProfilePage() {
  const router = useRouter();
  const theme = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userBooks, setUserBooks] = useState<UserBook[] | null>(null);
  const [stats, setStats] = useState<PersonalStats | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pendingAvatarId, setPendingAvatarId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/profile").then((res) => {
        if (res.status === 401) {
          router.push("/login");
          return null;
        }
        if (!res.ok) throw new Error("Failed to load profile");
        return res.json();
      }),
      fetch("/api/user-books").then((res) => (res.ok ? res.json() : [])),
      fetch("/api/stats").then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([profileData, userBooksData, statsData]) => {
        if (profileData) setProfile(profileData);
        setUserBooks(userBooksData ?? []);
        setStats(statsData);
      })
      .catch(() => setError("Could not load your profile. Please try again later."))
      .finally(() => setLoaded(true));
  }, [router]);

  const statCounts = useMemo(() => {
    const counts: Record<UserBook["status"], number> = { WANT_TO_READ: 0, READING: 0, READ: 0 };
    for (const ub of userBooks ?? []) counts[ub.status] += 1;
    return counts;
  }, [userBooks]);

  async function handleSaveAvatar() {
    if (!pendingAvatarId) return;
    setSaving(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarImageId: pendingAvatarId }),
      });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) {
        setError("Could not save your profile picture. Please try again.");
        return;
      }
      setProfile(await response.json());
      setPendingAvatarId(null);
    } catch {
      setError("Could not save your profile picture. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <CircularProgress sx={{ m: 4 }} />;

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  if (!profile) return null;

  const avatarUrl = resolveImageUrl(
    pendingAvatarId ?? profile.avatarImageId,
    profile.image,
    "full",
    "profilepictures"
  );

  const statChipSx = getStatChipSx(theme);

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
      <Box sx={{ position: { md: "sticky" }, top: { md: 88 } }}>
        <ProfileHero
          avatarUrl={avatarUrl}
          fallbackInitial={profile.name?.[0] ?? profile.email[0]}
          name={profile.name}
          email={profile.email}
          createdAt={profile.createdAt}
        >
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.5, mt: 3, mb: 4 }}>
            {STAT_TABS.map((tab) => (
              <ButtonBase
                key={tab.status}
                component={Link}
                href={`/bookshelf?status=${tab.status}`}
                sx={{ ...statChipSx, minWidth: 0, "&:hover": getStatChipHoverSx(theme) }}
              >
                <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1, color: "primary.main" }}>
                  {statCounts[tab.status]}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {tab.label}
                </Typography>
              </ButtonBase>
            ))}
          </Box>

          <Stack spacing={2} sx={{ alignItems: "center" }}>
            <ImageUploadButton purpose="avatar" onUploaded={(uid) => setPendingAvatarId(uid)} />
            {pendingAvatarId && (
              <Button variant="contained" onClick={handleSaveAvatar} disabled={saving}>
                Save profile picture
              </Button>
            )}
          </Stack>
        </ProfileHero>
      </Box>

      {stats && (
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
            Your Reading Stats
          </Typography>
          <PersonalStatsCharts stats={stats} statChipSx={statChipSx} name="You" />
        </Box>
      )}
    </Box>
  );
}
