"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Box, Typography, Alert, CircularProgress, Tabs, Tab } from "@mui/material";
import BarcodeScanner from "@/components/BarcodeScanner";
import IsbnLookupForm from "@/components/IsbnLookupForm";
import ManualBookForm from "@/components/ManualBookForm";

interface BookLike {
  id: string;
  title: string;
}

type Tab = "camera" | "lookup" | "manual";

export default function AdminNewBookPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [tab, setTab] = useState<Tab>("camera");
  const [scanStatus, setScanStatus] = useState<"scanning" | "looking-up" | "not-found" | "error">("scanning");
  const [message, setMessage] = useState<string | null>(null);

  function goToBook(book: BookLike) {
    router.push(`/books/${book.id}`);
  }

  async function handleDecode(isbn: string) {
    setScanStatus("looking-up");
    const response = await fetch(`/api/books/lookup?isbn=${encodeURIComponent(isbn)}`);
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (response.ok) {
      goToBook(await response.json());
      return;
    }
    setScanStatus("not-found");
    setMessage("No book found for that barcode.");
  }

  if (status === "loading") return <CircularProgress sx={{ m: 4 }} />;
  if (status !== "authenticated" || session?.user?.role !== "ADMIN") {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="text.secondary">You&apos;re not authorized to view this page.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: tab === "camera" ? 480 : 960, mx: "auto", mt: 4, px: { xs: 2, md: 0 } }}>
      <Typography variant="h5" gutterBottom>Create a book</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Adds this book to the shared repository only — it won&apos;t be added to your own shelf.
      </Typography>

      <Tabs value={tab} onChange={(_, value: Tab) => setTab(value)} sx={{ mb: 3 }}>
        <Tab label="Camera" value="camera" />
        <Tab label="Lookup" value="lookup" />
        <Tab label="Manual entry" value="manual" />
      </Tabs>

      {tab === "camera" && (
        <>
          {scanStatus === "scanning" && (
            <BarcodeScanner
              onDecode={handleDecode}
              onError={(msg) => {
                setScanStatus("error");
                setMessage(msg);
              }}
            />
          )}
          {scanStatus === "looking-up" && <CircularProgress sx={{ mt: 2 }} />}
          {(scanStatus === "not-found" || scanStatus === "error") && (
            <Alert severity="warning" sx={{ mt: 2 }}>{message}</Alert>
          )}
        </>
      )}

      {tab === "lookup" && <IsbnLookupForm onFound={goToBook} />}

      {tab === "manual" && (
        <Box sx={{ maxWidth: 560 }}>
          <ManualBookForm onCreated={goToBook} />
        </Box>
      )}
    </Box>
  );
}
