"use client";

import { useState } from "react";
import { Box, Typography, List, ListItem, ListItemAvatar, Avatar, ListItemText, Button, Stack } from "@mui/material";
import { resolveImageUrl } from "@/lib/storage/resolveImageUrl";

export interface RequestEntry {
  friendshipId: string;
  user: { id: string; name: string | null; email: string; image: string | null; avatarImageId: string | null };
}

interface FriendRequestsProps {
  incoming: RequestEntry[];
  outgoing: RequestEntry[];
  onRespond: (friendshipId: string, action: "accept" | "decline") => Promise<void>;
  onCancel: (friendshipId: string) => Promise<void>;
}

/** Incoming (Accept/Decline) and outgoing (Cancel) pending friend
 * requests. Renders nothing when there are none of either. */
export default function FriendRequests({ incoming, outgoing, onRespond, onCancel }: FriendRequestsProps) {
  const [busyId, setBusyId] = useState<string | null>(null);

  if (incoming.length === 0 && outgoing.length === 0) return null;

  async function handleRespond(friendshipId: string, action: "accept" | "decline") {
    setBusyId(friendshipId);
    try {
      await onRespond(friendshipId, action);
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(friendshipId: string) {
    setBusyId(friendshipId);
    try {
      await onCancel(friendshipId);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {incoming.length > 0 && (
        <Box>
          <Typography variant="subtitle2" gutterBottom>Requests</Typography>
          <List disablePadding>
            {incoming.map((entry) => (
              <ListItem key={entry.friendshipId} disableGutters>
                <ListItemAvatar>
                  <Avatar src={resolveImageUrl(entry.user.avatarImageId, entry.user.image, "sm", "profilepictures") ?? undefined}>
                    {(entry.user.name ?? entry.user.email).charAt(0).toUpperCase()}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText primary={entry.user.name ?? entry.user.email} />
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={busyId === entry.friendshipId}
                    onClick={() => handleRespond(entry.friendshipId, "accept")}
                  >
                    Accept
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={busyId === entry.friendshipId}
                    onClick={() => handleRespond(entry.friendshipId, "decline")}
                  >
                    Decline
                  </Button>
                </Stack>
              </ListItem>
            ))}
          </List>
        </Box>
      )}
      {outgoing.length > 0 && (
        <Box>
          <Typography variant="subtitle2" gutterBottom>Sent requests</Typography>
          <List disablePadding>
            {outgoing.map((entry) => (
              <ListItem key={entry.friendshipId} disableGutters>
                <ListItemAvatar>
                  <Avatar src={resolveImageUrl(entry.user.avatarImageId, entry.user.image, "sm", "profilepictures") ?? undefined}>
                    {(entry.user.name ?? entry.user.email).charAt(0).toUpperCase()}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText primary={entry.user.name ?? entry.user.email} secondary="Pending" />
                <Button size="small" variant="text" disabled={busyId === entry.friendshipId} onClick={() => handleCancel(entry.friendshipId)}>
                  Cancel
                </Button>
              </ListItem>
            ))}
          </List>
        </Box>
      )}
    </Box>
  );
}
