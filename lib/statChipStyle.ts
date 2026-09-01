import { alpha, type Theme } from "@mui/material/styles";
import type { SxProps } from "@mui/material";

/** Shared moss-green-tinted style for the small stat tiles used on the
 * profile page, personal stats charts, and friend shelf page (Want to
 * Read/Reading/Read counts, books/pages read, etc.) — one look for every
 * "number + label" chip in the app instead of each page inventing its own. */
export function getStatChipSx(theme: Theme): SxProps<Theme> {
  return {
    px: 2.5,
    py: 1.5,
    borderRadius: 2,
    bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.2 : 0.1),
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minWidth: 96,
  };
}

export function getStatChipHoverSx(theme: Theme) {
  return { bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.3 : 0.18) };
}
