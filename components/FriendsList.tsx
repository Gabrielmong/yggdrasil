"use client";

import { useState } from "react";
import Link from "next/link";
import { Box, Typography, List, ListItemButton, ListItemAvatar, Avatar, ListItemText, Button } from "@mui/material";
import { resolveImageUrl } from "@/lib/storage/resolveImageUrl";
import { displayName, displayInitial } from "@/lib/displayName";
import type { RequestEntry } from "@/components/FriendRequests";

/** Accepted friends list — each row links to that friend's read-only
 * shelf, with an inline Unfriend action. */
export default function FriendsList({
  friends,
  onUnfriend,
}: {
  friends: RequestEntry[];
  onUnfriend: (friendshipId: string) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleUnfriend(friendshipId: string) {
    setBusyId(friendshipId);
    try {
      await onUnfriend(friendshipId);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>Friends</Typography>
      {friends.length === 0 ? (
        <Typography color="text.secondary">No friends yet — search for someone above.</Typography>
      ) : (
        <List disablePadding>
          {friends.map((entry) => (
            <ListItemButton key={entry.friendshipId} component={Link} href={`/friends/${entry.user.id}`} sx={{ borderRadius: 1 }}>
              <ListItemAvatar>
                <Avatar src={resolveImageUrl(entry.user.avatarImageId, entry.user.image, "sm", "profilepictures") ?? undefined}>
                  {displayInitial(entry.user.name)}
                </Avatar>
              </ListItemAvatar>
              <ListItemText primary={displayName(entry.user.name)} />
              <Button
                size="small"
                variant="text"
                color="inherit"
                disabled={busyId === entry.friendshipId}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleUnfriend(entry.friendshipId);
                }}
              >
                Unfriend
              </Button>
            </ListItemButton>
          ))}
        </List>
      )}
    </Box>
  );
}
