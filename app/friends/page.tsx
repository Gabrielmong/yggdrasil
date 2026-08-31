"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Typography, CircularProgress, Divider } from "@mui/material";
import FriendSearch from "@/components/FriendSearch";
import FriendRequests, { type RequestEntry } from "@/components/FriendRequests";
import FriendsList from "@/components/FriendsList";

interface FriendshipsResponse {
  friends: RequestEntry[];
  incoming: RequestEntry[];
  outgoing: RequestEntry[];
}

export default function FriendsPage() {
  const router = useRouter();
  const [data, setData] = useState<FriendshipsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/friendships");
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (!response.ok) {
      setError("Could not load your friends. Please try again later.");
      return;
    }
    setData(await response.json());
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
  }, [load]);

  async function respond(friendshipId: string, action: "accept" | "decline") {
    const response = await fetch(`/api/friendships/${friendshipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (response.ok) await load();
  }

  async function remove(friendshipId: string) {
    const response = await fetch(`/api/friendships/${friendshipId}`, { method: "DELETE" });
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (response.ok) await load();
  }

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  if (!data) return <CircularProgress sx={{ m: 4 }} />;

  return (
    <Box sx={{ maxWidth: 640, mx: "auto", p: { xs: 2, md: 4 } }}>
      <Typography variant="h5" gutterBottom>Friends</Typography>
      <FriendSearch onRequestSent={load} />
      <Divider sx={{ my: 3 }} />
      <FriendRequests incoming={data.incoming} outgoing={data.outgoing} onRespond={respond} onCancel={remove} />
      {(data.incoming.length > 0 || data.outgoing.length > 0) && <Divider sx={{ my: 3 }} />}
      <FriendsList friends={data.friends} onUnfriend={remove} />
    </Box>
  );
}
