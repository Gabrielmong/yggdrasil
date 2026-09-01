"use client";

import { Box, Paper, Typography, Chip, Stack } from "@mui/material";
import type { FrequencyRow } from "@/lib/stats/personalStats";

const MAX_CHIPS = 10;

/** "Most popular genres/authors" chip lists computed from the ENTIRE
 * shelf (Want to Read + Reading + Read), not just books that have been
 * finished — so someone's stack of unread books shapes this too, not
 * only what they've already read. Renders nothing when the shelf is
 * empty. */
export default function PopularChips({ genres, authors }: { genres: FrequencyRow[]; authors: FrequencyRow[] }) {
  if (genres.length === 0 && authors.length === 0) return null;

  return (
    <Paper sx={{ p: 3, borderRadius: 3, display: "flex", flexDirection: "column", gap: 2 }}>
      {genres.length > 0 && (
        <Box>
          <Typography variant="subtitle2" gutterBottom>Most popular genres</Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            {genres.slice(0, MAX_CHIPS).map((genre) => (
              <Chip key={genre.name} label={`${genre.name} (${genre.count})`} size="small" />
            ))}
          </Stack>
        </Box>
      )}
      {authors.length > 0 && (
        <Box>
          <Typography variant="subtitle2" gutterBottom>Most popular authors</Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            {authors.slice(0, MAX_CHIPS).map((author) => (
              <Chip key={author.name} label={`${author.name} (${author.count})`} size="small" />
            ))}
          </Stack>
        </Box>
      )}
    </Paper>
  );
}
