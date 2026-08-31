"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  TextField,
  Button,
  Typography,
  CircularProgress,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import BookResultCard, { type BookSearchResult } from "@/components/BookResultCard";

interface BookLike {
  id: string;
  title: string;
  authors: string[];
}

type Source = "all" | "google" | "openlibrary" | "hardcover";

const SOURCE_TAG: Record<Exclude<Source, "all">, NonNullable<BookSearchResult["source"]>> = {
  google: "GOOGLE_BOOKS",
  openlibrary: "OPEN_LIBRARY",
  hardcover: "HARDCOVER",
};

const SOURCE_LABEL: Record<Source, string> = {
  all: "all sources",
  google: "Google",
  openlibrary: "Open Library",
  hardcover: "Hardcover",
};

/** Look up a book by ISBN, title, and/or author, all in one form. An exact
 * ISBN match resolves immediately; otherwise the chosen provider (or all of
 * them, merged) is searched and shown as a single results list to pick
 * from. Switching source after an "all sources" search just filters what's
 * already loaded instead of re-querying. */
export default function IsbnLookupForm({ onFound }: { onFound: (book: BookLike) => void }) {
  const router = useRouter();
  const [isbn, setIsbn] = useState("");
  const [titleQuery, setTitleQuery] = useState("");
  const [authorQuery, setAuthorQuery] = useState("");
  const [source, setSource] = useState<Source>("all");
  const [allResults, setAllResults] = useState<BookSearchResult[] | null>(null);
  const [fetchedSource, setFetchedSource] = useState<Source | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Searching...");
  const [error, setError] = useState<string | null>(null);

  const needsFetch = fetchedSource !== "all" && fetchedSource !== source;

  const displayedResults = useMemo(() => {
    if (!allResults) return null;
    if (source === "all" || fetchedSource !== "all") return allResults;
    return allResults.filter((r) => r.source === SOURCE_TAG[source]);
  }, [allResults, source, fetchedSource]);

  async function runSearch(searchSource: Source, trimmedTitle: string, trimmedAuthor: string, trimmedIsbn: string) {
    const params = new URLSearchParams();
    if (trimmedTitle) params.set("title", trimmedTitle);
    if (trimmedAuthor) params.set("author", trimmedAuthor);
    if (!trimmedTitle && !trimmedAuthor) params.set("q", trimmedIsbn);
    if (searchSource !== "all") params.set("source", searchSource);

    setLoading(true);
    setLoadingMessage("Searching...");
    const response = await fetch(`/api/books/search?${params.toString()}`);
    setLoading(false);
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (!response.ok) {
      setError("Search failed. Please try again.");
      return;
    }
    const data: BookSearchResult[] = await response.json();
    setAllResults(data);
    setFetchedSource(searchSource);
    if (data.length === 0) {
      setError(trimmedIsbn ? "No exact ISBN match, and no search results either." : "No books found for that search.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAllResults(null);
    setFetchedSource(null);

    const trimmedIsbn = isbn.trim();
    if (trimmedIsbn) {
      setLoading(true);
      setLoadingMessage("Fetching book information...");
      const response = await fetch(`/api/books/lookup?isbn=${encodeURIComponent(trimmedIsbn)}`);
      setLoading(false);
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (response.ok) {
        onFound(await response.json());
        return;
      }
      // No exact match — fall through to a title/author/ISBN search below.
    }

    const trimmedTitle = titleQuery.trim();
    const trimmedAuthor = authorQuery.trim();
    if (!trimmedTitle && !trimmedAuthor && !trimmedIsbn) {
      setError("Enter an ISBN, title, or author to search.");
      return;
    }

    await runSearch(source, trimmedTitle, trimmedAuthor, trimmedIsbn);
  }

  function handleSourceChange(_: unknown, value: Source | null) {
    if (!value) return;
    setSource(value);
    setError(null);
    // If this source isn't covered by what's already loaded (nothing
    // searched yet, or the last fetch was for a different single source),
    // leave it to the "press Search" prompt rather than firing a request
    // on every tab click — an "all sources" fetch covers every tab already.
  }

  async function handleSelect(selection: BookSearchResult) {
    setError(null);
    setLoading(true);
    setLoadingMessage("Fetching book information...");
    const params = new URLSearchParams();
    if (selection.isbn) params.set("isbn", selection.isbn);
    if (selection.googleId) params.set("googleId", selection.googleId);
    if (selection.hardcoverId) params.set("hardcoverId", selection.hardcoverId);

    const response = await fetch(`/api/books/lookup?${params.toString()}`);
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (response.ok) {
      onFound(await response.json());
      return;
    }

    setLoading(false);
    const body = await response.json().catch(() => ({}));
    setError(body.error ?? "Could not fetch complete information for that book. Please try another result.");
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 640 }}>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          <TextField label="ISBN" value={isbn} onChange={(e) => setIsbn(e.target.value)} size="small" sx={{ flex: 1, minWidth: 160 }} />
          <TextField label="Title" value={titleQuery} onChange={(e) => setTitleQuery(e.target.value)} size="small" sx={{ flex: 1, minWidth: 160 }} />
          <TextField label="Author" value={authorQuery} onChange={(e) => setAuthorQuery(e.target.value)} size="small" sx={{ flex: 1, minWidth: 160 }} />
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
          <ToggleButtonGroup value={source} exclusive size="small" onChange={handleSourceChange}>
            <ToggleButton value="all">All sources</ToggleButton>
            <ToggleButton value="google">Google</ToggleButton>
            <ToggleButton value="openlibrary">Open Library</ToggleButton>
            <ToggleButton value="hardcover">Hardcover</ToggleButton>
          </ToggleButtonGroup>
          <Button type="submit" variant="outlined">
            Search
          </Button>
        </Box>
      </Box>

      {loading && (
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, py: 8 }}>
          <CircularProgress size={28} />
          <Typography color="text.secondary">{loadingMessage}</Typography>
        </Box>
      )}
      {!loading && error && <Typography color="error">{error}</Typography>}
      {!loading && !error && allResults && needsFetch && (
        <Typography color="text.secondary">Press Search to look up results from {SOURCE_LABEL[source]}.</Typography>
      )}
      {!loading && displayedResults && displayedResults.length > 0 && (
        <>
          <Typography variant="body2" color="text.secondary">
            {displayedResults.length} {displayedResults.length === 1 ? "result" : "results"} from {SOURCE_LABEL[source]}
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
            {displayedResults.map((r) => (
              <BookResultCard
                key={`${r.source ?? ""}-${r.googleId ?? r.hardcoverId ?? r.isbn ?? r.title}`}
                result={r}
                onSelect={handleSelect}
              />
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}
