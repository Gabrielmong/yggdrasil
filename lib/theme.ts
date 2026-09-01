import { createTheme, type Theme } from "@mui/material/styles";

export const mossGreen = {
  main: "#4A5D45",
  light: "#7A8F73",
  dark: "#2F3D2B",
};

/** MUI X Charts don't pick up the app's theme colors on their own — every
 * chart passes this explicitly via its `colors` prop so bars stay on-brand
 * instead of the library's generic default palette. Moss green first, then
 * a muted warm gold for a second series (e.g. "You" vs "Friend" on the
 * comparison page) — picked to read clearly against green without clashing. */
export const chartColors = [mossGreen.main, "#B08D57", mossGreen.light, mossGreen.dark];

export const black = {
  main: "#000000",
  light: "#333333",
  dark: "#000000",
};

export function getTheme(mode: "light" | "dark"): Theme {
  return createTheme({
    palette: {
      mode,
      // mossGreen.main reads fine on the light theme's near-white
      // background, but it's too dark/desaturated for enough contrast
      // against the dark theme's near-black background (outlined/text
      // button labels, "primary.main"-colored stat numbers, etc. were
      // barely readable). Swap in the lighter shade as `main` for dark
      // mode instead, matching how MUI's own dark palettes brighten their
      // brand color rather than reusing the light-mode value as-is.
      primary: mode === "dark" ? { main: mossGreen.light, light: mossGreen.main, dark: mossGreen.dark } : mossGreen,
      background:
        mode === "light"
          ? { default: "#F7F8F4", paper: "#FFFFFF" }
          : { default: "#1B1F19", paper: "#242A22" },
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: '"Scoutie Sans", "Trebuchet MS", sans-serif',
      button: { textTransform: "none" },
    },
  });
}
