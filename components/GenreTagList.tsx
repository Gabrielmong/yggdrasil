"use client";

import { useState } from "react";
import { Box, Chip, Stack, Button } from "@mui/material";

const COLLAPSED_COUNT = 6;

/** Genre and subject chips, collapsed to a short preview when the list is long. */
export default function GenreTagList({ genres, tags = [] }: { genres: string[]; tags?: string[] }) {
  const values = [...genres, ...tags.filter((tag) => !genres.includes(tag))];
  const [expanded, setExpanded] = useState(false);

  if (values.length === 0) return null;

  const isLong = values.length > COLLAPSED_COUNT;
  const visible = expanded || !isLong ? values : values.slice(0, COLLAPSED_COUNT);

  return (
    <Box sx={{ my: 1 }}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
        {visible.map((g) => (
          <Chip
            key={g}
            label={g}
            size="small"
            sx={{
              maxWidth: "100%",
              "& .MuiChip-label": {
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              },
            }}
          />
        ))}
      </Stack>
      {isLong && (
        <Button size="small" onClick={() => setExpanded((prev) => !prev)} sx={{ mt: 1 }}>
          {expanded ? "Show less" : `Show all ${values.length}`}
        </Button>
      )}
    </Box>
  );
}
