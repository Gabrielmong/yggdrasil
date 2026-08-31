"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  TextField,
  Button,
  List,
  ListItem,
  ListItemAvatar,
  Avatar,
  ListItemText,
  Typography,
  CircularProgress,
} from "@mui/material";
import { resolveImageUrl } from "@/lib/storage/resolveImageUrl";

type Relationship = "NONE" | "PENDING_OUTGOING" | "PENDING_INCOMING" | "FRIENDS";

interface SearchResult {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  avatarImageId: string | null;
  relationship: Relationship;
}

/** Search users by name/email and send friend requests. Calls
 * onRequestSent after a successful send so the parent can refresh its
 * pending-requests lists. */
export default function FriendSearch({ onRequestSent }: { onRequestSent: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setError(null);
    setLoading(true);
    const response = await fetch(`/api/users/search?q=${encodeURIComponent(trimmed)}`);
    setLoading(false);
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (!response.ok) {
      setError("Search failed. Please try again.");
      return;
    }
    setResults(await response.json());
  }

  async function handleAdd(userId: string) {
    setPendingId(userId);
    setError(null);
    const response = await fetch("/api/friendships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresseeId: userId }),
    });
    setPendingId(null);
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Could not send friend request.");
      return;
    }
    setResults((prev) => prev?.map((r) => (r.id === userId ? { ...r, relationship: "PENDING_OUTGOING" } : r)) ?? null);
    onRequestSent();
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box component="form" onSubmit={handleSearch} sx={{ display: "flex", gap: 2 }}>
        <TextField
          label="Search by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          size="small"
          fullWidth
        />
        <Button type="submit" variant="outlined" sx={{ minWidth: 96 }}>
          Search
        </Button>
      </Box>
      {loading && <CircularProgress size={24} />}
      {error && <Typography color="error">{error}</Typography>}
      {results && results.length === 0 && <Typography color="text.secondary">No users found.</Typography>}
      {results && results.length > 0 && (
        <List disablePadding>
          {results.map((r) => (
            <ListItem
              key={r.id}
              secondaryAction={
                r.relationship === "FRIENDS" ? (
                  <Typography variant="body2" color="text.secondary">Friends</Typography>
                ) : r.relationship === "PENDING_OUTGOING" ? (
                  <Typography variant="body2" color="text.secondary">Request sent</Typography>
                ) : r.relationship === "PENDING_INCOMING" ? (
                  <Typography variant="body2" color="text.secondary">Check your requests</Typography>
                ) : (
                  <Button size="small" variant="outlined" disabled={pendingId === r.id} onClick={() => handleAdd(r.id)}>
                    Add friend
                  </Button>
                )
              }
            >
              <ListItemAvatar>
                <Avatar src={resolveImageUrl(r.avatarImageId, r.image, "sm", "profilepictures") ?? undefined}>
                  {(r.name ?? r.email).charAt(0).toUpperCase()}
                </Avatar>
              </ListItemAvatar>
              <ListItemText primary={r.name ?? r.email} secondary={r.name ? r.email : undefined} />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
}
