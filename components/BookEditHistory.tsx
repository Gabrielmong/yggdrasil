"use client";

import { useState } from "react";
import { Box, Typography, Button, Stack } from "@mui/material";

export interface BookEditEntry {
  id: string;
  editedAt: string;
  editedBy: { name: string | null; image: string | null };
  previousValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
}

interface BookEditHistoryProps {
  edits: BookEditEntry[];
  onRevert: (editId: string) => Promise<void>;
}

function summarizeFields(newValues: Record<string, unknown>): string {
  const fields = Object.keys(newValues);
  return fields.length === 0 ? "no fields" : fields.join(", ");
}

/** List of past edits to a book's shared fields, each with an "Undo"
 * action. Renders nothing when there's no history yet. */
export default function BookEditHistory({ edits, onRevert }: BookEditHistoryProps) {
  const [revertingId, setRevertingId] = useState<string | null>(null);

  if (edits.length === 0) return null;

  async function handleRevert(editId: string) {
    setRevertingId(editId);
    try {
      await onRevert(editId);
    } finally {
      setRevertingId(null);
    }
  }

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="subtitle2" gutterBottom>Edit history</Typography>
      <Stack spacing={1}>
        {edits.map((edit) => (
          <Box key={edit.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
              {edit.editedBy.name ?? "A community member"} changed {summarizeFields(edit.newValues)} —{" "}
              {new Date(edit.editedAt).toLocaleString()}
            </Typography>
            <Button
              size="small"
              onClick={() => handleRevert(edit.id)}
              disabled={revertingId === edit.id}
            >
              Undo
            </Button>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
