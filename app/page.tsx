"use client";

import { Box, Button, Container, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { useSession } from "next-auth/react";
import YggdrasilIcon from "@/components/YggdrasilIcon";

export default function Home() {
  const { data: session, status } = useSession();

  return (
    <Box
      component="main"
      sx={{
        minHeight: "calc(100vh - 64px)",
        display: "flex",
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
        backgroundImage:
          "linear-gradient(135deg, rgba(47, 61, 43, 0.98), rgba(74, 93, 69, 0.9)), repeating-linear-gradient(115deg, transparent 0, transparent 32px, rgba(255,255,255,0.035) 33px, transparent 34px)",
        color: "common.white",
        "&::after": {
          content: '""',
          position: "absolute",
          width: "min(55vw, 680px)",
          height: "min(55vw, 680px)",
          right: "-12vw",
          bottom: "-26vw",
          border: "1px solid rgba(255,255,255,0.16)",
          borderRadius: "50%",
          boxShadow: "0 0 0 52px rgba(255,255,255,0.035), 0 0 0 104px rgba(255,255,255,0.025)",
        },
      }}
    >
      <Container maxWidth="lg" sx={{ position: "relative", zIndex: 1, py: { xs: 8, md: 12 } }}>
        <Stack spacing={4} sx={{ maxWidth: 720 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <YggdrasilIcon color="#D7E2CE" size={64} />
            <Typography
              variant="overline"
              sx={{ color: "#D7E2CE", letterSpacing: "0.18em", fontWeight: 700 }}
            >
              Yggdrasil
            </Typography>
          </Stack>

          <Box>
            <Typography
              component="h1"
              sx={{
                fontSize: { xs: "3.25rem", md: "5.5rem" },
                lineHeight: 0.96,
                fontWeight: 700,
                maxWidth: 650,
              }}
            >
              Keep the books that keep you growing.
            </Typography>
            <Typography variant="h6" sx={{ mt: 3, maxWidth: 560, color: "rgba(255,255,255,0.78)", fontWeight: 400 }}>
              A calm, personal shelf for discovering stories, tracking your reading, and making room for the next good book.
            </Typography>
          </Box>

          {status !== "loading" && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              {session?.user ? (
                <Link href="/bookshelf" style={{ textDecoration: "none" }}>
                  <Button
                    variant="contained"
                    size="large"
                    sx={{
                      px: 4,
                      py: 1.5,
                      color: "#2F3D2B",
                      backgroundColor: "#E5EEDC",
                      "&:hover": { backgroundColor: "#FFFFFF" },
                    }}
                  >
                    Back to app
                  </Button>
                </Link>
              ) : (
                <>
                  <Link href="/login" style={{ textDecoration: "none" }}>
                    <Button
                      variant="contained"
                      size="large"
                      sx={{
                        px: 4,
                        py: 1.5,
                        color: "#2F3D2B",
                        backgroundColor: "#E5EEDC",
                        "&:hover": { backgroundColor: "#FFFFFF" },
                      }}
                    >
                      Log in to your shelf
                    </Button>
                  </Link>
                  <Link href="/register" style={{ textDecoration: "none" }}>
                    <Button
                      variant="outlined"
                      size="large"
                      sx={{ px: 4, py: 1.5, color: "common.white", borderColor: "rgba(255,255,255,0.45)" }}
                    >
                      Create an account
                    </Button>
                  </Link>
                </>
              )}
            </Stack>
          )}

          <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.58)", maxWidth: 440 }}>
            Your reading life, gathered in one place.
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
}
