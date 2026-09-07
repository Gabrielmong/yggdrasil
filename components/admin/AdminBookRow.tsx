"use client";

import { useState } from "react";
import Link from "next/link";
import { ListItem, ListItemAvatar, Avatar, ListItemText, Chip, Button, Stack } from "@mui/material";
import ConfirmDialog from "@/components/ConfirmDialog";
import { resolveImageUrl } from "@/lib/storage/resolveImageUrl";

export interface AdminBook {
  id: string;
  isbn: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  coverImageId: string | null;
  source: string;
  fetchedAt: string;
  _count: { userBooks: number };
}

export default function AdminBookRow({ book, onDelete }: { book: AdminBook; onDelete: (id: string) => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const coverUrl = resolveImageUrl(book.coverImageId, book.coverUrl, "sm", "covers");

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete(book.id);
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <ListItem disableGutters sx={{ flexWrap: "wrap", gap: 1 }}>
      <ListItemAvatar>
        <Avatar variant="rounded" src={coverUrl ?? undefined}>{book.title.charAt(0).toUpperCase()}</Avatar>
      </ListItemAvatar>
      <ListItemText
        primary={<Link href={`/books/${book.id}`}>{book.title}</Link>}
        secondary={`${book.authors.join(", ") || "Unknown author"} · ${book.isbn} · fetched ${new Date(book.fetchedAt).toLocaleDateString()} · on ${book._count.userBooks} ${book._count.userBooks === 1 ? "shelf" : "shelves"}`}
      />
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Chip size="small" label={book.source} variant="outlined" />
        <Button size="small" color="error" variant="outlined" onClick={() => setConfirming(true)}>
          Delete
        </Button>
      </Stack>

      <ConfirmDialog
        open={confirming}
        title="Delete this book?"
        message={`Delete "${book.title}" from the repository entirely? It will be removed from every shelf that has it. This can't be undone.`}
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        confirmColor="error"
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </ListItem>
  );
}
