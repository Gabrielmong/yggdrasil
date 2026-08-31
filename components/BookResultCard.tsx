"use client";

import { Card, CardActionArea, CardMedia, CardContent, Typography, Box, Chip } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

export interface BookSearchResult {
  isbn?: string;
  googleId?: string;
  hardcoverId?: string;
  source?: "GOOGLE_BOOKS" | "OPEN_LIBRARY" | "HARDCOVER";
  title: string;
  authors: string[];
  coverUrl: string | null;
}

const SOURCE_LABEL: Record<NonNullable<BookSearchResult["source"]>, string> = {
  GOOGLE_BOOKS: "Google",
  OPEN_LIBRARY: "Open Library",
  HARDCOVER: "Hardcover",
};

/** Compact card for a single search result: cover, title, author, ISBN, and
 * a small chip naming which provider it came from. */
export default function BookResultCard({
  result,
  onSelect,
}: {
  result: BookSearchResult;
  onSelect: (result: BookSearchResult) => void;
}) {
  const theme = useTheme();
  const authorsText = result.authors.join(", ") || "Unknown author";

  return (
    <Card sx={{ width: 160 }}>
      <CardActionArea onClick={() => onSelect(result)} sx={{ height: "100%" }}>
        {result.coverUrl ? (
          <CardMedia
            component="img"
            image={result.coverUrl}
            alt={result.title}
            sx={{ height: 200, objectFit: "cover" }}
          />
        ) : (
          <Box
            sx={{
              height: 200,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              px: 1.5,
              background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.18)}, ${alpha(theme.palette.background.paper, 0.9)})`,
              color: theme.palette.text.primary,
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 700,
                display: "-webkit-box",
                WebkitLineClamp: 5,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {result.title}
            </Typography>
          </Box>
        )}
        <CardContent sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          <Typography
            variant="subtitle2"
            sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
          >
            {result.title}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}
          >
            {authorsText}
          </Typography>
          {result.isbn && (
            <Typography variant="caption" color="text.secondary">
              ISBN {result.isbn}
            </Typography>
          )}
          {result.source && (
            <Chip label={SOURCE_LABEL[result.source]} size="small" variant="outlined" sx={{ alignSelf: "flex-start", mt: 0.5 }} />
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
