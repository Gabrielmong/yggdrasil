"use client";

import { useRef } from "react";
import type { ReactNode } from "react";
import { Box, IconButton } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

const SCROLL_AMOUNT = 340;

/** Horizontally scrolling row for a list of fixed-width cards (book
 * covers, mainly) — used wherever a wrapping grid of cards could grow
 * tall enough to push the rest of the page down, e.g. a friend's shelf.
 * Cards snap into place on scroll; arrow buttons sit alongside native
 * swipe/scroll for desktop pointer users. */
export default function BookCarousel({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollBy(amount: number) {
    scrollRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <IconButton
        onClick={() => scrollBy(-SCROLL_AMOUNT)}
        aria-label="Scroll left"
        size="small"
        sx={{ display: { xs: "none", sm: "inline-flex" }, flexShrink: 0 }}
      >
        <ChevronLeftIcon />
      </IconButton>

      <Box
        ref={scrollRef}
        sx={{
          display: "flex",
          gap: 2,
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          scrollBehavior: "smooth",
          py: 0.5,
          "& > *": { scrollSnapAlign: "start", flexShrink: 0 },
        }}
      >
        {children}
      </Box>

      <IconButton
        onClick={() => scrollBy(SCROLL_AMOUNT)}
        aria-label="Scroll right"
        size="small"
        sx={{ display: { xs: "none", sm: "inline-flex" }, flexShrink: 0 }}
      >
        <ChevronRightIcon />
      </IconButton>
    </Box>
  );
}
