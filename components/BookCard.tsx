"use client";

import { Box, Card, CardActionArea, CardMedia, CardContent, Typography, Rating } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import Link from "next/link";

interface UserBookLike {
  id: string;
  rating: number | null;
  book: { id: string; title: string; authors: string[]; coverUrl: string | null };
}

export default function BookCard({ userBook }: { userBook: UserBookLike }) {
  const authorsText = userBook.book.authors.join(", ") || "Unknown author";
  const theme = useTheme();

  return (
    <Card sx={{ width: 160 }}>
      <CardActionArea component={Link} href={`/books/${userBook.book.id}`}>
        {userBook.book.coverUrl ? (
          <CardMedia
            component="img"
            image={userBook.book.coverUrl}
            alt={userBook.book.title}
            sx={{ height: 220, objectFit: "cover" }}
          />
        ) : (
          <Box
            sx={{
              height: 220,
              px: 1.5,
              py: 2,
              display: "flex",
              alignItems: "stretch",
              justifyContent: "center",
              textAlign: "center",
              background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.18)}, ${alpha(theme.palette.background.paper, 0.9)})`,
              color: theme.palette.text.primary,
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
                {userBook.book.title}
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  pb: 0.5,
                }}
              >
                {authorsText}
              </Typography>
            </Box>
          </Box>
        )}
        <CardContent>
          <Typography
            variant="subtitle2"
            sx={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {userBook.book.title}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {authorsText}
          </Typography>
          {userBook.rating != null && <Rating value={userBook.rating} readOnly size="small" />}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
