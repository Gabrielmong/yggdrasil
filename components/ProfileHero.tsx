"use client";

import type { ReactNode } from "react";
import { Avatar, Box, Paper, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";

function memberSince(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** Shared profile-card hero: moss-green gradient banner with the avatar
 * overlapping it, name/email/member-since below. Used by both the current
 * user's profile page and a friend's shelf page so they read as the same
 * kind of card. `children` holds whatever page-specific controls go below
 * the identity block (stat chips, an avatar upload button, etc). */
export default function ProfileHero({
  avatarUrl,
  fallbackInitial,
  name,
  email,
  createdAt,
  children,
}: {
  avatarUrl?: string | null;
  fallbackInitial: string;
  name: string | null;
  email: string;
  createdAt: string;
  children?: ReactNode;
}) {
  const theme = useTheme();

  return (
    <Paper sx={{ borderRadius: 3, maxWidth: 560, mx: "auto", width: "100%", overflow: "hidden" }}>
      <Box
        sx={{
          height: 96,
          background: `linear-gradient(135deg, ${theme.palette.primary.dark}, ${theme.palette.primary.main})`,
        }}
      />
      <Box sx={{ p: { xs: 3, md: 5 }, pt: 0, textAlign: "center" }}>
        <Avatar
          src={avatarUrl ?? undefined}
          sx={{
            width: 140,
            height: 140,
            mx: "auto",
            mt: "-70px",
            mb: 2,
            fontSize: 48,
            border: "4px solid",
            borderColor: "background.paper",
          }}
        >
          {fallbackInitial}
        </Avatar>

        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          {name ?? "Reader"}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {email}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          Member since {memberSince(createdAt)}
        </Typography>

        {children}
      </Box>
    </Paper>
  );
}
