"use client";

import { Box, Card, CardActionArea, CardContent, CardMedia, Rating, Typography } from "@mui/material";
import Link from "next/link";
import { resolveImageUrl } from "@/lib/storage/resolveImageUrl";

export interface RecommendedBookRow {
  bookId: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  coverImageId: string | null;
  friendRating: number | null;
}

/** Books your friend has read that aren't on your shelf yet, ranked by how
 * well they match the genres you already read a lot of. Links through to
 * the book detail page, which now supports viewing (and adding) a book
 * that isn't on your shelf. */
export default function RecommendationsGrid({ books, friendName }: { books: RecommendedBookRow[]; friendName: string }) {
  if (books.length === 0) {
    return (
      <Typography color="text.secondary">
        {friendName} hasn&apos;t read anything you don&apos;t already have on your shelf.
      </Typography>
    );
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
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}
              >
                {book.authors.join(", ") || "Unknown author"}
              </Typography>
              {book.friendRating != null && <Rating value={book.friendRating} readOnly size="small" sx={{ display: "block", mt: 0.5 }} />}
            </CardContent>
          </CardActionArea>
        </Card>
      ))}
    </Box>
  );
}
