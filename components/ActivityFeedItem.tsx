"use client";

import { Avatar, Box, Rating, Typography } from "@mui/material";
import Link from "next/link";
import { resolveImageUrl } from "@/lib/storage/resolveImageUrl";
import { formatRelativeTime } from "@/lib/activity/formatRelativeTime";

export interface ActivityFeedEvent {
  id: string;
  type: "STARTED_READING" | "FINISHED" | "RATED";
  rating: number | null;
  createdAt: string;
  user: { id: string; name: string | null; image: string | null; avatarImageId: string | null };
  book: { id: string; title: string; authors: string[]; coverUrl: string | null; coverImageId: string | null };
}

const VERB: Record<ActivityFeedEvent["type"], string> = {
  STARTED_READING: "started reading",
  FINISHED: "finished",
  RATED: "rated",
};

export default function ActivityFeedItem({ event }: { event: ActivityFeedEvent }) {
  const userName = event.user.name ?? "Someone";
  const avatarUrl = resolveImageUrl(event.user.avatarImageId, event.user.image, "sm", "profilepictures");
  const coverUrl = resolveImageUrl(event.book.coverImageId, event.book.coverUrl, "sm", "covers");

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, py: 1.5 }}>
      <Avatar component={Link} href={`/friends/${event.user.id}`} src={avatarUrl ?? undefined} sx={{ width: 40, height: 40 }}>
        {userName.charAt(0).toUpperCase()}
      </Avatar>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2">
          <Typography component={Link} href={`/friends/${event.user.id}`} sx={{ fontWeight: 600, color: "inherit", textDecoration: "none" }}>
            {userName}
          </Typography>{" "}
          {VERB[event.type]}{" "}
          <Typography component={Link} href={`/books/${event.book.id}`} sx={{ fontWeight: 600, color: "inherit", textDecoration: "none" }}>
            {event.book.title}
          </Typography>
        </Typography>
        {event.type === "RATED" && event.rating != null && <Rating value={event.rating} readOnly size="small" />}
        <Typography variant="caption" color="text.secondary">
          {formatRelativeTime(event.createdAt)}
        </Typography>
      </Box>

      {coverUrl && (
        <Box component={Link} href={`/books/${event.book.id}`} sx={{ flexShrink: 0 }}>
          <Box component="img" src={coverUrl} alt={event.book.title} sx={{ width: 40, height: 56, objectFit: "cover", borderRadius: 1 }} />
        </Box>
      )}
    </Box>
  );
}
