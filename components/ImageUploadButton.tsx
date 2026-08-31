"use client";

import { useState } from "react";
import { Button, CircularProgress, Typography, Box } from "@mui/material";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

interface ImageUploadButtonProps {
  purpose: "book-cover" | "avatar";
  onUploaded: (uid: string) => void;
}

/** Button + hidden file input that uploads an image to POST /api/uploads
 * and reports the resulting uid back once processing completes. */
export default function ImageUploadButton({ purpose, onUploaded }: ImageUploadButtonProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Only JPEG, PNG, and WebP images are allowed");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError("File must be 5MB or smaller");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("purpose", purpose);
      const response = await fetch("/api/uploads", { method: "POST", body: formData });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? "Upload failed. Please try again.");
        return;
      }
      const { uid } = await response.json();
      onUploaded(uid);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Box>
      <Button variant="outlined" component="label" disabled={uploading}>
        {uploading ? <CircularProgress size={20} /> : "Upload image"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={handleFileChange}
        />
      </Button>
      {error && (
        <Typography color="error" variant="body2" sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
