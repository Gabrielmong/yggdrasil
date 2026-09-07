"use client";

import { ListItem, ListItemAvatar, Avatar, ListItemText, Stack, ToggleButtonGroup, ToggleButton, Button, Typography } from "@mui/material";
import { resolveImageUrl } from "@/lib/storage/resolveImageUrl";
import { displayName, displayInitial } from "@/lib/displayName";

export interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  avatarImageId: string | null;
  createdAt: string;
  role: "USER" | "ADMIN";
  active: boolean;
  _count: { userBooks: number };
}

export default function AdminUserRow({
  user,
  isSelf,
  busy,
  onChangeRole,
  onToggleActive,
}: {
  user: AdminUser;
  isSelf: boolean;
  busy: boolean;
  onChangeRole: (id: string, role: "USER" | "ADMIN") => void;
  onToggleActive: (id: string, active: boolean) => void;
}) {
  const avatarUrl = resolveImageUrl(user.avatarImageId, user.image, "sm", "profilepictures");

  return (
    <ListItem disableGutters sx={{ flexWrap: "wrap", gap: 1 }}>
      <ListItemAvatar>
        <Avatar src={avatarUrl ?? undefined}>{displayInitial(user.name)}</Avatar>
      </ListItemAvatar>
      <ListItemText
        primary={displayName(user.name)}
        secondary={`${user.email} · joined ${new Date(user.createdAt).toLocaleDateString()} · ${user._count.userBooks} books${user.active ? "" : " · deactivated"}`}
      />
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <ToggleButtonGroup
          value={user.role}
          exclusive
          size="small"
          disabled={isSelf || busy}
          onChange={(_, value: "USER" | "ADMIN" | null) => value && onChangeRole(user.id, value)}
        >
          <ToggleButton value="USER">User</ToggleButton>
          <ToggleButton value="ADMIN">Admin</ToggleButton>
        </ToggleButtonGroup>
        <Button
          size="small"
          variant="outlined"
          color={user.active ? "error" : "primary"}
          disabled={isSelf || busy}
          onClick={() => onToggleActive(user.id, !user.active)}
        >
          {user.active ? "Deactivate" : "Reactivate"}
        </Button>
      </Stack>
      {isSelf && (
        <Typography variant="caption" color="text.secondary" sx={{ width: "100%" }}>
          You can&apos;t change your own account here.
        </Typography>
      )}
    </ListItem>
  );
}
