"use client";

import { Box, Paper, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";

function verdict(score: number): string {
  if (score >= 70) return "Great match!";
  if (score >= 40) return "Some real overlap.";
  if (score >= 15) return "A little in common.";
  return "Not much overlap yet.";
}

/** Headline "compatibility" card for the compare page: a big percentage
 * (the Jaccard similarity of both sides' combined genre+author sets) with
 * a one-line verdict. Renders nothing when there isn't enough read data
 * on either side to compute a score yet. */
export default function CompatibilityScore({ score, friendName }: { score: number | null; friendName: string }) {
  const theme = useTheme();
  if (score == null) return null;

  return (
    <Paper
      sx={{
        p: 4,
        borderRadius: 3,
        textAlign: "center",
        background: `linear-gradient(135deg, ${theme.palette.primary.dark}, ${theme.palette.primary.main})`,
        color: theme.palette.primary.contrastText,
      }}
    >
      <Typography variant="overline" sx={{ opacity: 0.85 }}>
        You &amp; {friendName}
      </Typography>
      <Box sx={{ my: 1 }}>
        <Typography variant="h2" sx={{ fontWeight: 700, lineHeight: 1 }}>
          {score}%
        </Typography>
      </Box>
      <Typography variant="body1">{verdict(score)}</Typography>
      <Typography variant="caption" sx={{ display: "block", mt: 1, opacity: 0.75 }}>
        Based on shared genres and authors across books you&apos;ve both read
      </Typography>
    </Paper>
  );
}
