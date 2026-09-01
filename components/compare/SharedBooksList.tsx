"use client";

import { Box, Card, CardActionArea, CardContent, CardMedia, Rating, Typography } from "@mui/material";
import Link from "next/link";
import { resolveImageUrl } from "@/lib/storage/resolveImageUrl";

export interface SharedBookRow {
  bookId: string;
  title: string;
  coverUrl: string | null;
  coverImageId: string | null;
  yourRating: number | null;
  friendRating: number | null;
}

/** Books both of you have marked Read, each with both sides' ratings —
 * the compare page previously only ever compared genre/author frequency,
 * never surfaced the literal overlap in what you've each actually read. */
export default function SharedBooksList({ books, friendName }: { books: SharedBookRow[]; friendName: string }) {
  if (books.length === 0) {
    return <Typography color="text.secondary">You haven&apos;t both read any of the same books yet.</Typography>;
  }

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
      {books.map((book) => (
        <Card key={book.bookId} sx={{ width: 180 }}>
          <CardActionArea component={Link} href={`/books/${book.bookId}`}>
            {book.coverUrl || book.coverImageId ? (
              <CardMedia
                component="img"
                image={resolveImageUrl(book.coverImageId, book.coverUrl, "sm", "covers") ?? undefined}
                alt={book.title}
                sx={{ height: 220, objectFit: "cover" }}
              />
            ) : null}
            <CardContent>
              <Typography
                variant="subtitle2"
                sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
              >
                {book.title}
              </Typography>
              <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 0.5 }}>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                  <Typography variant="caption" color="text.secondary">You</Typography>
                  <Rating value={book.yourRating} readOnly size="small" />
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: "45%" }}>
                    {friendName}
                  </Typography>
                  <Rating value={book.friendRating} readOnly size="small" />
                </Box>
              </Box>
            </CardContent>
          </CardActionArea>
        </Card>
      ))}
    </Box>
  );
}
