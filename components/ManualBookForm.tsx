"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, TextField, Button, Typography } from "@mui/material";
import ImageUploadButton from "@/components/ImageUploadButton";
import GenreTagAutocomplete from "@/components/GenreTagAutocomplete";

interface BookLike {
  id: string;
  title: string;
  authors: string[];
}

/** Full manual entry form for a book that can't be found by ISBN or search —
 * every field the shared Book cache supports, not just title/authors. */
export default function ManualBookForm({ onCreated }: { onCreated: (book: BookLike) => void }) {
  const router = useRouter();
  const [isbn, setIsbn] = useState("");
  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [description, setDescription] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [coverUrl, setCoverUrl] = useState("");
  const [coverImageId, setCoverImageId] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState("");
  const [publishedYear, setPublishedYear] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title can't be empty.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const response = await fetch("/api/books/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isbn: isbn.trim(),
          title: trimmedTitle,
          authors: authors.split(",").map((a) => a.trim()).filter(Boolean),
          description: description.trim() || null,
          genres,
          tags,
          coverUrl: coverUrl.trim() || null,
          coverImageId,
          pageCount: pageCount.trim() ? Number(pageCount) : null,
          publishedYear: publishedYear.trim() ? Number(publishedYear) : null,
        }),
      });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? "Could not save this book");
        return;
      }
      onCreated(await response.json());
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {error && <Typography color="error">{error}</Typography>}
      <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      <TextField label="Authors (comma-separated)" value={authors} onChange={(e) => setAuthors(e.target.value)} />
      <TextField label="ISBN (optional)" value={isbn} onChange={(e) => setIsbn(e.target.value)} />
      <TextField
        label="Description"
        multiline
        minRows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <GenreTagAutocomplete label="Genres (optional)" endpoint="/api/genres" value={genres} onChange={setGenres} />
      <GenreTagAutocomplete label="Tags (optional)" endpoint="/api/tags" value={tags} onChange={setTags} />
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        <TextField
          label="Page count"
          type="number"
          value={pageCount}
          onChange={(e) => setPageCount(e.target.value)}
          sx={{ flex: 1, minWidth: 140 }}
        />
        <TextField
          label="Published year"
          type="number"
          value={publishedYear}
          onChange={(e) => setPublishedYear(e.target.value)}
          sx={{ flex: 1, minWidth: 140 }}
        />
      </Box>
      <TextField label="Cover image URL" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} />
      <Typography variant="body2" color="text.secondary">
        Or upload a cover image:
      </Typography>
      <ImageUploadButton purpose="book-cover" onUploaded={(uid) => setCoverImageId(uid)} />
      <Button type="submit" variant="contained" disabled={saving} sx={{ alignSelf: "flex-start" }}>
        Save book
      </Button>
    </Box>
  );
}
