"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Box, Typography, CircularProgress, TextField, List, Divider, Button, Alert } from "@mui/material";
import AdminBookRow, { type AdminBook } from "@/components/admin/AdminBookRow";

export default function AdminBooksPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [books, setBooks] = useState<AdminBook[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let ignore = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch(`/api/admin/books${search ? `?q=${encodeURIComponent(search)}` : ""}`, {
        signal: controller.signal,
      })
        .then((res) => {
          if (res.status === 401) {
            router.push("/login");
            return null;
          }
          if (!res.ok) throw new Error("Failed to load books");
          return res.json();
        })
        .then((data) => {
          if (ignore) return;
          if (data) setBooks(data);
        })
        .catch((err) => {
          if (ignore || err?.name === "AbortError") return;
          setError("Could not load books. Please try again later.");
        });
    }, 250);
    return () => {
      ignore = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [router, status, search]);

  async function deleteBook(id: string) {
    setActionError(null);
    const response = await fetch(`/api/admin/books/${id}`, { method: "DELETE" });
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (!response.ok) {
      setActionError("Could not delete that book. Please try again.");
      return;
    }
    setBooks((prev) => (prev ? prev.filter((b) => b.id !== id) : prev));
  }

  if (status === "loading") return <CircularProgress sx={{ m: 4 }} />;
  if (status !== "authenticated" || session?.user?.role !== "ADMIN") {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="text.secondary">You&apos;re not authorized to view this page.</Typography>
      </Box>
    );
  }
  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }
  if (!books) return <CircularProgress sx={{ m: 4 }} />;

  return (
    <Box sx={{ maxWidth: 800, mx: "auto", p: { xs: 2, md: 4 } }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, mb: 3, flexWrap: "wrap" }}>
        <Typography variant="h5">Books</Typography>
        <Button variant="contained" component={Link} href="/admin/books/new">
          Create book
        </Button>
      </Box>
      {actionError && (
        <Alert severity="error" onClose={() => setActionError(null)} sx={{ mb: 2 }}>
          {actionError}
        </Alert>
      )}
      <TextField
        size="small"
        label="Search title, author, or ISBN"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 3, minWidth: 280 }}
      />
      {books.length === 0 ? (
        <Typography color="text.secondary">No books match that search.</Typography>
      ) : (
        <List disablePadding>
          {books.map((book, index) => (
            <Box key={book.id}>
              <AdminBookRow book={book} onDelete={deleteBook} />
              {index < books.length - 1 && <Divider component="li" />}
            </Box>
          ))}
        </List>
      )}
    </Box>
  );
}
