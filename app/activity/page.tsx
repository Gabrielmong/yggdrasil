"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, CircularProgress, Divider, Typography } from "@mui/material";
import ActivityFeedItem, { type ActivityFeedEvent } from "@/components/ActivityFeedItem";

interface ActivityResponse {
  events: ActivityFeedEvent[];
  nextCursor: string | null;
}

export default function ActivityPage() {
  const router = useRouter();
  const [events, setEvents] = useState<ActivityFeedEvent[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (before: string | null) => {
      const url = before ? `/api/activity?before=${before}` : "/api/activity";
      const response = await fetch(url);
      if (response.status === 401) {
        router.push("/login");
        return null;
      }
      if (!response.ok) {
        throw new Error("Failed to load activity");
      }
      return (await response.json()) as ActivityResponse;
    },
    [router]
  );

  useEffect(() => {
    loadPage(null)
      .then((data) => {
        if (!data) return;
        setEvents(data.events);
        setNextCursor(data.nextCursor);
      })
      .catch(() => setError("Could not load your friends' activity. Please try again later."));
  }, [loadPage]);

  async function handleLoadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const data = await loadPage(nextCursor);
      if (!data) return;
      setEvents((prev) => [...(prev ?? []), ...data.events]);
      setNextCursor(data.nextCursor);
    } catch {
      setError("Could not load more activity. Please try again later.");
    } finally {
      setLoadingMore(false);
    }
  }

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  if (!events) return <CircularProgress sx={{ m: 4 }} />;

  return (
    <Box sx={{ maxWidth: 640, mx: "auto", p: { xs: 2, md: 4 } }}>
      <Typography variant="h5" gutterBottom>
        Activity
      </Typography>

      {events.length === 0 ? (
        <Typography color="text.secondary" sx={{ mt: 4, textAlign: "center" }}>
          No activity yet — once your friends start, finish, or rate books, you&apos;ll see it here.
        </Typography>
      ) : (
        <>
          {events.map((event, index) => (
            <Box key={event.id}>
              <ActivityFeedItem event={event} />
              {index < events.length - 1 && <Divider />}
            </Box>
          ))}
          {nextCursor && (
            <Box sx={{ textAlign: "center", mt: 2 }}>
              <Button variant="outlined" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
