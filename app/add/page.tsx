"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Typography, Alert, CircularProgress, Tabs, Tab } from "@mui/material";
import BarcodeScanner from "@/components/BarcodeScanner";
import IsbnLookupForm from "@/components/IsbnLookupForm";
import ManualBookForm from "@/components/ManualBookForm";

interface BookLike {
  id: string;
  title: string;
}

type Tab = "camera" | "lookup" | "manual";

export default function ScanPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("camera");
  const [status, setStatus] = useState<"scanning" | "looking-up" | "not-found" | "error">("scanning");
  const [message, setMessage] = useState<string | null>(null);

  async function addToShelfAndRedirect(book: BookLike) {
    const response = await fetch("/api/user-books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: book.id, status: "WANT_TO_READ" }),
    });
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (!response.ok) {
      setStatus("error");
      setMessage("Could not add this book to your shelf. Please try again.");
      return;
    }
    router.push(`/books/${book.id}`);
  }

  async function handleDecode(isbn: string) {
    setStatus("looking-up");
    const response = await fetch(`/api/books/lookup?isbn=${encodeURIComponent(isbn)}`);
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (response.ok) {
      await addToShelfAndRedirect(await response.json());
      return;
    }
    setStatus("not-found");
    setMessage("No book found for that barcode.");
  }

  return (
    <Box sx={{ maxWidth: tab === "camera" ? 480 : 960, mx: "auto", mt: 4, px: { xs: 2, md: 0 } }}>
      <Typography variant="h5" gutterBottom>Add a book</Typography>

      <Tabs value={tab} onChange={(_, value: Tab) => setTab(value)} sx={{ mb: 3 }}>
        <Tab label="Camera" value="camera" />
        <Tab label="Lookup" value="lookup" />
        <Tab label="Manual entry" value="manual" />
      </Tabs>

      {tab === "camera" && (
        <>
          {status === "scanning" && (
            <BarcodeScanner
              onDecode={handleDecode}
              onError={(msg) => {
                setStatus("error");
                setMessage(msg);
              }}
            />
          )}
          {status === "looking-up" && <CircularProgress sx={{ mt: 2 }} />}
          {(status === "not-found" || status === "error") && (
            <Alert severity="warning" sx={{ mt: 2 }}>{message}</Alert>
          )}
        </>
      )}

      {tab === "lookup" && <IsbnLookupForm onFound={addToShelfAndRedirect} />}

      {tab === "manual" && (
        <Box sx={{ maxWidth: 560 }}>
          <ManualBookForm onCreated={addToShelfAndRedirect} />
        </Box>
      )}
    </Box>
  );
}
