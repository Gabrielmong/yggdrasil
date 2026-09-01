"use client";

import { Box, Rating, TextField, Select, MenuItem, Button } from "@mui/material";

export type ReadingStatus = "WANT_TO_READ" | "READING" | "READ";

export interface UserBookFields {
  status: ReadingStatus;
  rating: number | null;
  notes: string | null;
  finishedAt: string | null;
}

interface BookStatusEditorProps {
  userBook: UserBookFields;
  onUpdate: (data: Partial<UserBookFields>) => void;
}

/** Editable status/rating/notes controls for a shelved book, wired to a single PATCH callback. */
export default function BookStatusEditor({ userBook, onUpdate }: BookStatusEditorProps) {
  return (
    <Box>
      <Select
        value={userBook.status}
        onChange={(e) => {
          const status = e.target.value as ReadingStatus;
          // Auto-fill finishedAt the first time a book is marked Read, so
          // "books read over time" has something to bucket by without an
          // extra manual step — "Mark finished today" below stays available
          // to correct the date afterward.
          const shouldSetFinishedAt = status === "READ" && !userBook.finishedAt;
          onUpdate({ status, ...(shouldSetFinishedAt ? { finishedAt: new Date().toISOString() } : {}) });
        }}
        sx={{ mb: 2 }}
      >
        <MenuItem value="WANT_TO_READ">Want to Read</MenuItem>
        <MenuItem value="READING">Reading</MenuItem>
        <MenuItem value="READ">Read</MenuItem>
      </Select>

      {userBook.status === "READ" && (
        <Rating
          value={userBook.rating ?? 0}
          onChange={(_, value) => onUpdate({ rating: value })}
          sx={{
            display: "flex",
            flexDirection: "row",
            width: "fit-content",
            mb: 2,
            "& .MuiRating-group": {
              display: "flex",
              flexDirection: "row",
            },
          }}
        />
      )}

      <TextField
        label="Notes"
        multiline
        minRows={3}
        fullWidth
        defaultValue={userBook.notes ?? ""}
        onBlur={(e) => onUpdate({ notes: e.target.value })}
        sx={{ mb: 2 }}
      />

      <Button variant="text" onClick={() => onUpdate({ finishedAt: new Date().toISOString() })}>
        Mark finished today
      </Button>
    </Box>
  );
}
