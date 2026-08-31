"use client";

import { Box, Typography } from "@mui/material";
import BookCover from "@/components/BookCover";
import GenreTagList from "@/components/GenreTagList";

interface BookLike {
  title: string;
  authors: string[];
  coverUrl: string | null;
  description: string | null;
  genres: string[];
  tags: string[];
}

/** Read-only display of a book's cover, title, authors, genres, and description. */
export default function BookDetailHeader({ book }: { book: BookLike }) {
  return (
    <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, alignItems: { xs: "center", md: "flex-start" }, gap: { xs: 3, md: 4 }, width: "100%" }}>
      <BookCover
        title={book.title}
        authors={book.authors}
        coverUrl={book.coverUrl}
        width={{ xs: "min(100%, 240px)", md: 200 }}
        height={300}
      />
      <Box sx={{ flex: 1, minWidth: 0, width: { xs: "100%", md: "auto" }, overflowWrap: "anywhere" }}>
        <Typography variant="h4" sx={{ overflowWrap: "anywhere" }}>{book.title}</Typography>
        <Typography variant="subtitle1" color="text.secondary" gutterBottom sx={{ overflowWrap: "anywhere" }}>
          {book.authors.join(", ")}
        </Typography>
        <GenreTagList genres={book.genres} tags={book.tags} />
        <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>
          Description
        </Typography>
        <Typography variant="body2" color={book.description ? "text.primary" : "text.secondary"} sx={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
          {book.description || "No description available for this book."}
        </Typography>
      </Box>
    </Box>
  );
}
