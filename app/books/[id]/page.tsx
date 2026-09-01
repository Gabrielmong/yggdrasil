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

interface BookLike {
  id: string;
  isbn: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  coverImageId: string | null;
  description: string | null;
  genres: string[];
  tags: string[];
}

interface UserBook extends UserBookFields {
  id: string;
  startedAt: string | null;
  book: BookLike;
}

export default function BookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [userBook, setUserBook] = useState<UserBook | null>(null);
  const [book, setBook] = useState<BookLike | null>(null);
  const [bookNotFound, setBookNotFound] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<BookEditEntry[]>([]);
  const [editingBook, setEditingBook] = useState(false);
  const [addingToShelf, setAddingToShelf] = useState(false);

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
      .then(async (all: UserBook[] | null) => {
        if (!all) return;
        const match = all.find((ub) => ub.book.id === id) ?? null;
        if (match) {
          setUserBook(match);
          await loadEdits(match.book.id);
          return;
        }

        // Not on this user's shelf — the community book repository is open
        // to view (and edit) regardless of ownership, so look the book up
        // directly instead of dead-ending here.
        const bookResponse = await fetch(`/api/books/${id}`);
        if (bookResponse.status === 401) {
          router.push("/login");
          return;
        }
        if (bookResponse.status === 404) {
          setBookNotFound(true);
          return;
        }
        if (!bookResponse.ok) throw new Error("Failed to load book");
        const bookData: BookLike = await bookResponse.json();
        setBook(bookData);
        await loadEdits(bookData.id);
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

  async function addToShelf() {
    setAddingToShelf(true);
    try {
      const response = await fetch("/api/user-books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId: id, status: "WANT_TO_READ" }),
      });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) {
        setError("Could not add this book to your shelf. Please try again.");
        return;
      }
      setUserBook(await response.json());
      setBook(null);
    } catch (err) {
      console.error("Failed to add book to shelf", err);
      setError("Could not add this book to your shelf. Please try again.");
    } finally {
      setAddingToShelf(false);
    }
  }

  async function saveBookEdit(patch: Partial<EditableBookFields>) {
    const currentBookId = userBook?.book.id ?? book?.id;
    if (!currentBookId) return;
    try {
      const response = await fetch(`/api/books/${currentBookId}`, {
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
      if (userBook) {
        setUserBook((prev) => (prev ? { ...prev, book: { ...prev.book, ...updatedBook } } : prev));
      } else {
        setBook((prev) => (prev ? { ...prev, ...updatedBook } : prev));
      }
      await loadEdits(currentBookId);
      setEditingBook(false);
    } catch (err) {
      console.error("Failed to save book edit", err);
      setError("Could not save this book's details. Please try again.");
    }
  }

  async function removeFromShelf() {
    if (!userBook) return;
    if (!window.confirm("Remove this book from your shelf? Your rating, notes, and status for it will be lost.")) {
      return;
    }
    try {
      const response = await fetch(`/api/user-books/${userBook.id}`, { method: "DELETE" });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) {
        setError("Could not remove this book. Please try again.");
        return;
      }
      router.push("/bookshelf");
    } catch (err) {
      console.error("Failed to remove book from shelf", err);
      setError("Could not remove this book. Please try again.");
    }
  }

  async function revertEdit(editId: string) {
    const currentBookId = userBook?.book.id ?? book?.id;
    if (!currentBookId) return;
    try {
      const response = await fetch(`/api/books/${currentBookId}/edits/${editId}/revert`, {
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
      if (userBook) {
        setUserBook((prev) => (prev ? { ...prev, book: { ...prev.book, ...updatedBook } } : prev));
      } else {
        setBook((prev) => (prev ? { ...prev, ...updatedBook } : prev));
      }
      await loadEdits(currentBookId);
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

  if (bookNotFound) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="text.secondary">This book doesn&apos;t exist.</Typography>
      </Box>
    );
  }

  const displayBook = userBook?.book ?? book;
  if (!displayBook) return null;

  return (
    <Box sx={{ maxWidth: 700, mx: "auto", p: { xs: 2, md: 4 }, width: "100%" }}>
      <BookDetailHeader
        book={{
          ...displayBook,
          coverUrl: resolveImageUrl(displayBook.coverImageId, displayBook.coverUrl, "md", "covers"),
        }}
      />

      {!userBook && (
        <Button variant="contained" onClick={addToShelf} disabled={addingToShelf} sx={{ mt: 2 }}>
          Add to my shelf
        </Button>
      )}

      {editingBook ? (
        <BookEditForm book={displayBook} onSave={saveBookEdit} onCancel={() => setEditingBook(false)} />
      ) : (
        <Button size="small" onClick={() => setEditingBook(true)} sx={{ mt: 1, display: "block" }}>
          Edit details
        </Button>
      )}
      <BookEditHistory edits={edits} onRevert={revertEdit} />

      {userBook && (
        <>
          <Box sx={{ mt: 3 }}>
            <BookStatusEditor userBook={userBook} onUpdate={updateField} />
          </Box>
          <Button color="error" size="small" onClick={removeFromShelf} sx={{ mt: 2 }}>
            Remove from shelf
          </Button>
        </>
      )}
    </Box>
  );
}
