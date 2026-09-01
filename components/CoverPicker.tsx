"use client";

import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  TextField,
  Button,
  CircularProgress,
  Typography,
  ButtonBase,
} from "@mui/material";

interface SearchResult {
  coverUrl: string | null;
}

/** Cover-search dialog for BookEditForm: queries the same three book-data
 * providers used when adding a book (Google Books, OpenLibrary, Hardcover)
 * by title/author, then shows every distinct cover image they return as a
 * clickable grid. There's no standalone "cover search" API to call here —
 * this is the existing /api/books/search endpoint, just mined for covers
 * instead of full book records. */
export default function CoverPicker({
  initialTitle,
  initialAuthor,
  onSelect,
  onClose,
}: {
  initialTitle: string;
  initialAuthor: string;
  onSelect: (coverUrl: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [author, setAuthor] = useState(initialAuthor);
  const [covers, setCovers] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    if (!title.trim() && !author.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (title.trim()) params.set("title", title.trim());
      if (author.trim()) params.set("author", author.trim());
      const response = await fetch(`/api/books/search?${params.toString()}`);
      if (!response.ok) {
        setError("Search failed. Please try again.");
        return;
      }
      const results: SearchResult[] = await response.json();
      const uniqueCovers = [...new Set(results.map((r) => r.coverUrl).filter((url): url is string => Boolean(url)))];
      setCovers(uniqueCovers);
    } catch (err) {
      console.error("Failed to search for covers", err);
      setError("Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Search for a cover</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", gap: 2, mb: 2, mt: 1 }}>
          <TextField label="Title" size="small" fullWidth value={title} onChange={(e) => setTitle(e.target.value)} />
          <TextField label="Author" size="small" fullWidth value={author} onChange={(e) => setAuthor(e.target.value)} />
          <Button variant="outlined" onClick={handleSearch} disabled={loading} sx={{ flexShrink: 0 }}>
            Search
          </Button>
        </Box>

        {loading && <CircularProgress size={24} />}
        {error && <Typography color="error">{error}</Typography>}
        {covers && covers.length === 0 && (
          <Typography color="text.secondary">No cover images found. Try adjusting the title or author.</Typography>
        )}
        {covers && covers.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
            {covers.map((coverUrl) => (
              <ButtonBase
                key={coverUrl}
                onClick={() => onSelect(coverUrl)}
                sx={{
                  borderRadius: 1,
                  overflow: "hidden",
                  border: "2px solid transparent",
                  "&:hover": { borderColor: "primary.main" },
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external URLs from three different providers, not worth configuring next/image's remote patterns for */}
                <img src={coverUrl} alt="" width={100} height={150} style={{ objectFit: "cover", display: "block" }} />
              </ButtonBase>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
