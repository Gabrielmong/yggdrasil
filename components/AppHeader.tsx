"use client";

import { useEffect, useState } from "react";
import { AppBar, Toolbar, Typography, IconButton, Box, Avatar, Menu, MenuItem, ListItemIcon, Badge } from "@mui/material";
import { Brightness4, Brightness7, QrCodeScanner, People } from "@mui/icons-material";
import { useThemeMode } from "@/lib/theme-mode-context";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import YggdrasilIcon from "@/components/YggdrasilIcon";
import { black } from "@/lib/theme";
import { resolveImageUrl } from "@/lib/storage/resolveImageUrl";

export default function AppHeader() {
  const { mode, toggleMode } = useThemeMode();
  const { data: session } = useSession();
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [avatarImageId, setAvatarImageId] = useState<string | null>(null);
  const [incomingRequestCount, setIncomingRequestCount] = useState(0);
  const menuOpen = Boolean(menuAnchor);
  const userName = session?.user?.name ?? session?.user?.email ?? "User";
  const avatarUrl = resolveImageUrl(avatarImageId, session?.user?.image ?? null, "sm", "profilepictures");

  // The session's `image` only ever reflects Google's OAuth photo — an
  // uploaded profile picture lives in avatarImageId, which isn't part of
  // the auth session, so it's fetched once per sign-in instead.
  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setAvatarImageId(data?.avatarImageId ?? null))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email]);

  // Same one-fetch-per-sign-in pattern as the avatar effect above.
  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/friendships")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setIncomingRequestCount(data?.incoming?.length ?? 0))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email]);

  return (
    <AppBar position="static" color="primary" enableColorOnDark>
      <Toolbar>
        <Box
          component={Link}
          href="/bookshelf"
          sx={{ display: "flex", alignItems: "center", gap: 1, flexGrow: 1, color: "inherit", textDecoration: "none" }}
        >
          <YggdrasilIcon color={black.dark} size={30} />
          <Typography variant="h6" component="span">
            Yggdrasil
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {!session?.user && (
            <IconButton onClick={toggleMode} color="inherit" aria-label="toggle dark mode">
              {mode === "dark" ? <Brightness7 /> : <Brightness4 />}
            </IconButton>
          )}
          {session?.user && (
            <IconButton component={Link} href="/add" color="inherit" aria-label="add a book">
              <QrCodeScanner />
            </IconButton>
          )}
          {session?.user && (
            <IconButton component={Link} href="/friends" color="inherit" aria-label="friends">
              <Badge badgeContent={incomingRequestCount} color="error" invisible={incomingRequestCount === 0}>
                <People />
              </Badge>
            </IconButton>
          )}
          {session?.user && (
            <>
              <IconButton
                id="account-menu-button"
                onClick={(event) => setMenuAnchor(event.currentTarget)}
                aria-label="open account menu"
                aria-controls={menuOpen ? "account-menu" : undefined}
                aria-haspopup="true"
                aria-expanded={menuOpen ? "true" : undefined}
              >
                <Avatar src={avatarUrl ?? undefined} alt={userName} sx={{ width: 32, height: 32 }}>
                  {userName.charAt(0).toUpperCase()}
                </Avatar>
              </IconButton>
              <Menu
                id="account-menu"
                anchorEl={menuAnchor}
                open={menuOpen}
                onClose={() => setMenuAnchor(null)}
                slotProps={{ list: { "aria-labelledby": "account-menu-button" } }}
              >
                <MenuItem component={Link} href="/profile" onClick={() => setMenuAnchor(null)}>
                  Profile
                </MenuItem>
                <MenuItem onClick={() => signOut({ callbackUrl: "/login" })}>Sign out</MenuItem>
                <MenuItem
                  onClick={() => {
                    toggleMode();
                    setMenuAnchor(null);
                  }}
                >
                  <ListItemIcon>
                    {mode === "dark" ? <Brightness7 fontSize="small" /> : <Brightness4 fontSize="small" />}
                  </ListItemIcon>
                  {mode === "dark" ? "Use light mode" : "Use dark mode"}
                </MenuItem>
              </Menu>
            </>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
}
