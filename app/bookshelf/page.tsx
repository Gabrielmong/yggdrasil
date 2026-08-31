"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Box, Tabs, Tab, CircularProgress, Button, Typography, TextField, MenuItem, Select, FormControl, InputLabel, Chip } from "@mui/material";
import { QrCodeScanner } from "@mui/icons-material";
import BookCard from "@/components/BookCard";
import { resolveImageUrl } from "@/lib/storage/resolveImageUrl";

interface UserBook {
  id: string;
  status: "WANT_TO_READ" | "READING" | "READ";
  rating: number | null;
  book: {
    id: string;
    title: string;
    authors: string[];
    genres: string[];
    tags: string[];
    coverUrl: string | null;
    coverImageId: string | null;
  };
}

const TABS: { label: string; status: UserBook["status"] | "ALL" }[] = [
  { label: "All", status: "ALL" },
  { label: "Want to Read", status: "WANT_TO_READ" },
  { label: "Reading", status: "READING" },
  { label: "Read", status: "READ" },
];

function authorSortKey(authors: string[]) {
  return authors
    .map((author) => author.trim().split(/\s+/).pop() ?? "")
    .join(", ");
}

export default function BookshelfPage() {
  return (
    <Suspense fallback={<CircularProgress sx={{ m: 4 }} />}>
      <BookshelfPageContent />
    </Suspense>
  );
}

function BookshelfPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [userBooks, setUserBooks] = useState<UserBook[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchIn, setSearchIn] = useState<"all" | "title" | "author" | "genre" | "tag">("all");
  const [sortBy, setSortBy] = useState<"title" | "author" | "newest">("author");

  // The active tab lives in the URL (?status=...), not local state — so a
  // refresh, the browser's back/forward buttons, and links from other pages
  // (e.g. the profile page's stat chips) all land on the right tab.
  const statusParam = searchParams.get("status");
  const tab = Math.max(
    TABS.findIndex((t) => t.status === (statusParam ?? "ALL")),
    0
  );

  function handleTabChange(_: unknown, index: number) {
    const status = TABS[index].status;
    const params = new URLSearchParams(searchParams.toString());
    if (status === "ALL") {
      params.delete("status");
    } else {
      params.set("status", status);
    }
    const query = params.toString();
    router.replace(query ? `/bookshelf?${query}` : "/bookshelf", { scroll: false });
  }

  useEffect(() => {
    fetch("/api/user-books")
      .then((res) => {
        if (res.status === 401) {
          router.push("/login");
          return null;
        }
        if (!res.ok) {
          throw new Error("Failed to load your bookshelf");
        }
        return res.json();
      })
      .then((data) => {
        if (data) setUserBooks(data);
      })
      .catch(() => setError("Could not load your bookshelf. Please try again later."));
  }, [router]);

  const books = userBooks ?? [];
  const activeStatus = TABS[tab].status;
  const filtered = useMemo(() => {
    const statusFiltered = activeStatus === "ALL" ? books : books.filter((ub) => ub.status === activeStatus);
    const searchTerm = search.trim().toLowerCase();

    const searched = searchTerm
      ? statusFiltered.filter((ub) => {
          const fields = {
            title: [ub.book.title],
            author: ub.book.authors,
            genre: ub.book.genres,
            tag: ub.book.tags,
          };
          const values = searchIn === "all" ? Object.values(fields).flat() : fields[searchIn];
          return values.some((value) => value.toLowerCase().includes(searchTerm));
        })
      : statusFiltered;

    const sorted = [...searched];
    sorted.sort((a, b) => {
      if (sortBy === "title") {
        return a.book.title.localeCompare(b.book.title);
      }
      if (sortBy === "author") {
        const authorComparison = authorSortKey(a.book.authors).localeCompare(authorSortKey(b.book.authors));
        return authorComparison || a.book.authors.join(", ").localeCompare(b.book.authors.join(", "));
      }
      return b.id.localeCompare(a.id);
    });

    return sorted;
  }, [books, activeStatus, search, searchIn, sortBy]);

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  if (!userBooks) return <CircularProgress sx={{ m: 4 }} />;

  const hasSearch = search.trim().length > 0 || searchIn !== "all";

  return (
    <Box sx={{ p: 4 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3, gap: 2, flexWrap: "wrap" }}>
        <Tabs value={tab} onChange={handleTabChange}>
          {TABS.map((t) => (
            <Tab key={t.status} label={t.label} />
          ))}
        </Tabs>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Chip
            size="small"
            label={`${userBooks.length} ${userBooks.length === 1 ? "book" : "books"}`}
            variant="outlined"
          />
          <Button variant="contained" startIcon={<QrCodeScanner />} component="a" href="/add">
            Add a book
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, mb: 3, flexWrap: "wrap" }}>
        <TextField
          size="small"
          label="Search title, author, genre, or tag"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: { xs: "100%", md: 320 }, flex: 1 }}
        />

        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="bookshelf-search-in-label">Search in</InputLabel>
          <Select
            labelId="bookshelf-search-in-label"
            label="Search in"
            value={searchIn}
            onChange={(e) => setSearchIn(e.target.value as typeof searchIn)}
          >
            <MenuItem value="all">Everything</MenuItem>
            <MenuItem value="title">Title</MenuItem>
            <MenuItem value="author">Author</MenuItem>
            <MenuItem value="genre">Genre</MenuItem>
            <MenuItem value="tag">Tag</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="bookshelf-sort-label">Sort by</InputLabel>
          <Select
            labelId="bookshelf-sort-label"
            label="Sort by"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          >
            <MenuItem value="title">Title</MenuItem>
            <MenuItem value="author">Author</MenuItem>
            <MenuItem value="newest">Newest</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {filtered.length === 0 ? (
        <Box sx={{ textAlign: "center", mt: 6 }}>
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            {hasSearch ? "No books match that search." : "No books here yet."}
          </Typography>
          {hasSearch ? (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Try another title, author, genre, or tag.
              </Typography>
              <Button
                variant="outlined"
                onClick={() => {
                  setSearch("");
                  setSearchIn("all");
                }}
              >
                Clear search
              </Button>
            </>
          ) : (
            <Button variant="outlined" startIcon={<QrCodeScanner />} component="a" href="/add">
              Add a book
            </Button>
          )}
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
          {filtered.map((ub) => (
            <BookCard
              key={ub.id}
              userBook={{
                ...ub,
                book: { ...ub.book, coverUrl: resolveImageUrl(ub.book.coverImageId, ub.book.coverUrl, "md", "covers") },
              }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
