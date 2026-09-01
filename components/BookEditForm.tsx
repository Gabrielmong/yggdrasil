"use client";

import { useState } from "react";
import { Box, TextField, Button, Typography } from "@mui/material";
import type { EditableBookFields } from "@/lib/books/bookEditDiff";
import ImageUploadButton from "@/components/ImageUploadButton";
import GenreTagAutocomplete from "@/components/GenreTagAutocomplete";
import CoverPicker from "@/components/CoverPicker";

interface BookEditFormProps {
  book: EditableBookFields;
  onSave: (patch: Partial<EditableBookFields>) => Promise<void>;
  onCancel: () => void;
}

/** Explicit edit form for a book's shared, community-editable fields
 * (description, tags, cover image) — requires an explicit save, since
 * these changes affect every user, not just the person editing. */
export default function BookEditForm({ book, onSave, onCancel }: BookEditFormProps) {
  const [title, setTitle] = useState(book.title);
  const [authors, setAuthors] = useState(book.authors.join(", "));
  const [description, setDescription] = useState(book.description ?? "");
  const [genres, setGenres] = useState<string[]>(book.genres);
  const [tags, setTags] = useState<string[]>(book.tags);
  const [coverUrl, setCoverUrl] = useState(book.coverUrl ?? "");
  const [coverImageId, setCoverImageId] = useState<string | null>(book.coverImageId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickingCover, setPickingCover] = useState(false);

  function handleCoverPicked(url: string) {
    setCoverUrl(url);
    // A newly picked cover should actually show — resolveImageUrl prefers
    // an uploaded coverImageId over coverUrl whenever both are set.
    setCoverImageId(null);
    setPickingCover(false);
  }

  async function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title can't be empty.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave({
        title: trimmedTitle,
        authors: authors.split(",").map((a) => a.trim()).filter(Boolean),
        description: description.trim() || null,
        genres,
        tags,
        coverUrl: coverUrl.trim() || null,
        coverImageId,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, my: 2 }}>
      <Typography variant="subtitle2">Edit book details</Typography>
      {error && (
        <Typography color="error" variant="body2">
          {error}
        </Typography>
      )}
      <TextField label="Title" fullWidth required value={title} onChange={(e) => setTitle(e.target.value)} />
      <TextField
        label="Authors (comma-separated)"
        fullWidth
        value={authors}
        onChange={(e) => setAuthors(e.target.value)}
      />
      <TextField
        label="Description"
        multiline
        minRows={3}
        fullWidth
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <GenreTagAutocomplete label="Genres" endpoint="/api/genres" value={genres} onChange={setGenres} />
      <GenreTagAutocomplete label="Tags" endpoint="/api/tags" value={tags} onChange={setTags} />
      <TextField
        label="Cover image URL"
        fullWidth
        value={coverUrl}
        onChange={(e) => setCoverUrl(e.target.value)}
      />
      <Box>
        <Button variant="outlined" size="small" onClick={() => setPickingCover(true)}>
          Search for a cover
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary">
        Or upload an image:
      </Typography>
      <ImageUploadButton purpose="book-cover" onUploaded={(uid) => setCoverImageId(uid)} />
      {pickingCover && (
        <CoverPicker
          initialTitle={title}
          initialAuthor={authors}
          onSelect={handleCoverPicked}
          onClose={() => setPickingCover(false)}
        />
      )}
      <Box sx={{ display: "flex", gap: 2 }}>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          Save changes
        </Button>
        <Button variant="text" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </Box>
    </Box>
  );
}
