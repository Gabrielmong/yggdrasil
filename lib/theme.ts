import { createTheme, type Theme } from "@mui/material/styles";

export const mossGreen = {
  main: "#4A5D45",
  light: "#7A8F73",
  dark: "#2F3D2B",
};

export const black = {
  main: "#000000",
  light: "#333333",
  dark: "#000000",
};

export function getTheme(mode: "light" | "dark"): Theme {
  return createTheme({
    palette: {
      mode,
      primary: mossGreen,
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
