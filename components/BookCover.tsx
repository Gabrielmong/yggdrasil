"use client";

import { Box, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

interface BookCoverProps {
  title: string;
  authors: string[];
  coverUrl: string | null;
  height?: number;
  width?: number | string | Record<string, number | string>;
  borderRadius?: number;
}

export default function BookCover({
  title,
  authors,
  coverUrl,
  height = 220,
  width = "100%",
  borderRadius = 2,
}: BookCoverProps) {
  const theme = useTheme();
  const authorsText = authors.join(", ") || "Unknown author";

  if (coverUrl) {
    return (
      <Box
        component="img"
        src={coverUrl}
        alt={title}
        sx={{
          display: "block",
          width,
          height,
          objectFit: "cover",
          borderRadius,
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <Box
      sx={{
        width,
        height,
        borderRadius,
        px: 1.5,
        py: 2,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
        textAlign: "center",
        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.18)}, ${alpha(theme.palette.background.paper, 0.9)})`,
        color: theme.palette.text.primary,
        flexShrink: 0,
      }}
    >
      <Box
        sx={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <Typography
          variant="subtitle1"
          sx={{
            fontWeight: 700,
            lineHeight: 1.2,
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            mt: 1,
          }}
        >
          {title}
        </Typography>

        <Typography variant="caption" color="text.secondary" sx={{ display: "block", pb: 0.5 }}>
          {authorsText}
        </Typography>
      </Box>
    </Box>
  );
}
