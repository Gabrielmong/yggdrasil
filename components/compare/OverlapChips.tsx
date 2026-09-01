"use client";

import { Box, Chip, Stack, Typography } from "@mui/material";

/** Three chip rows for one category (genres or authors): what you share,
 * what's only on your side, and what's only on your friend's — the
 * complement of "shared" the compare page previously left out entirely. */
export default function OverlapChips({
  title,
  shared,
  yourOnly,
  friendOnly,
  friendName,
}: {
  title: string;
  shared: string[];
  yourOnly: string[];
  friendOnly: string[];
  friendName: string;
}) {
  const rows = [
    { label: "You both like", values: shared },
    { label: "Only you", values: yourOnly },
    { label: `Only ${friendName}`, values: friendOnly },
  ];

  return (
    <Box>
      <Typography variant="subtitle1" gutterBottom>{title}</Typography>
      <Stack spacing={1.5}>
        {rows.map((row) => (
          <Box key={row.label}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              {row.label}
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
              {row.values.length === 0 ? (
                <Typography variant="body2" color="text.secondary">None yet.</Typography>
              ) : (
                row.values.map((label) => <Chip key={label} label={label} size="small" />)
              )}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
