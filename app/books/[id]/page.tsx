"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { Box, CircularProgress, Typography, Button } from "@mui/material";
import BookDetailHeader from "@/components/BookDetailHeader";
import { resolveImageUrl } from "@/lib/storage/resolveImageUrl";
import BookStatusEditor, { UserBookFields } from "@/components/BookStatusEditor";
import BookEditForm from "@/components/BookEditForm";
import type { EditableBookFields } from "@/lib/books/bookEditDiff";
import BookEditHistory, { BookEditEntry } from "@/components/BookEditHistory";

interface UserBook extends UserBookFields {
  id: string;
  startedAt: string | null;
  book: {
    id: string;
    title: string;
    authors: string[];
    coverUrl: string | null;
    coverImageId: string | null;
    description: string | null;
    genres: string[];
    tags: string[];
  };
}

export default function BookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [userBook, setUserBook] = useState<UserBook | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<BookEditEntry[]>([]);
  const [editingBook, setEditingBook] = useState(false);

  const loadEdits = useCallback(async (bookId: string) => {
    try {
      const response = await fetch(`/api/books/${bookId}/edits`);
      if (response.ok) setEdits(await response.json());
    } catch (err) {
      console.error("Failed to load edit history", err);
    }
  }, []);

  useEffect(() => {
    fetch("/api/user-books")
      .then((res) => {
        if (res.status === 401) {
          router.push("/login");
          return null;
        }
        if (!res.ok) {
          throw new Error("Failed to load book");
        }
        return res.json();
      })
      .then((all: UserBook[] | null) => {
        const match = all ? all.find((ub) => ub.book.id === id) ?? null : null;
        setUserBook(match);
        if (match) loadEdits(match.book.id);
      })
      .catch(() => setError("Could not load this book. Please try again later."))
      .finally(() => setLoaded(true));
  }, [id, router, loadEdits]);

  async function updateField(data: Partial<UserBookFields>) {
    if (!userBook) return;
    const response = await fetch(`/api/user-books/${userBook.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (!response.ok) {
      setError("Could not save your changes. Please try again.");
      return;
    }
    setUserBook(await response.json());
  }

  async function saveBookEdit(patch: Partial<EditableBookFields>) {
    if (!userBook) return;
    try {
      const response = await fetch(`/api/books/${userBook.book.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) {
        setError("Could not save this book's details. Please try again.");
        return;
      }
      const updatedBook = await response.json();
      setUserBook((prev) => (prev ? { ...prev, book: { ...prev.book, ...updatedBook } } : prev));
      await loadEdits(userBook.book.id);
      setEditingBook(false);
    } catch (err) {
      console.error("Failed to save book edit", err);
      setError("Could not save this book's details. Please try again.");
    }
  }

  async function revertEdit(editId: string) {
    if (!userBook) return;
    try {
      const response = await fetch(`/api/books/${userBook.book.id}/edits/${editId}/revert`, {
        method: "POST",
      });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) {
        setError("Could not undo that edit. Please try again.");
        return;
      }
      const updatedBook = await response.json();
      setUserBook((prev) => (prev ? { ...prev, book: { ...prev.book, ...updatedBook } } : prev));
      await loadEdits(userBook.book.id);
    } catch (err) {
      console.error("Failed to revert book edit", err);
      setError("Could not undo that edit. Please try again.");
    }
  }

  if (!loaded) return <CircularProgress sx={{ m: 4 }} />;

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  if (!userBook) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="text.secondary">This book isn&apos;t on your shelf.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 700, mx: "auto", p: { xs: 2, md: 4 }, width: "100%" }}>
      <BookDetailHeader
        book={{
          ...userBook.book,
          coverUrl: resolveImageUrl(userBook.book.coverImageId, userBook.book.coverUrl, "md", "covers"),
        }}
      />
      {editingBook ? (
        <BookEditForm book={userBook.book} onSave={saveBookEdit} onCancel={() => setEditingBook(false)} />
      ) : (
        <Button size="small" onClick={() => setEditingBook(true)} sx={{ mt: 1 }}>
          Edit details
        </Button>
      )}
      <BookEditHistory edits={edits} onRevert={revertEdit} />
      <Box sx={{ mt: 3 }}>
        <BookStatusEditor userBook={userBook} onUpdate={updateField} />
      </Box>
    </Box>
  );
}
