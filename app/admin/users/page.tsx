"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Box, Typography, CircularProgress, TextField, List, Divider, Alert } from "@mui/material";
import AdminUserRow, { type AdminUser } from "@/components/admin/AdminUserRow";

export default function AdminUsersPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let ignore = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch(`/api/admin/users${search ? `?q=${encodeURIComponent(search)}` : ""}`, {
        signal: controller.signal,
      })
        .then((res) => {
          if (res.status === 401) {
            router.push("/login");
            return null;
          }
          if (!res.ok) throw new Error("Failed to load users");
          return res.json();
        })
        .then((data) => {
          if (ignore) return;
          if (data) setUsers(data);
        })
        .catch((err) => {
          if (ignore || err?.name === "AbortError") return;
          setError("Could not load users. Please try again later.");
        });
    }, 250);
    return () => {
      ignore = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [router, status, search]);

  async function patchUser(id: string, body: { role?: "USER" | "ADMIN"; active?: boolean }) {
    setBusyId(id);
    setActionError(null);
    try {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) {
        setActionError("Could not update that user. Please try again.");
        return;
      }
      const updated: AdminUser = await response.json();
      setUsers((prev) => (prev ? prev.map((u) => (u.id === updated.id ? updated : u)) : prev));
    } finally {
      setBusyId(null);
    }
  }

  if (status === "loading") return <CircularProgress sx={{ m: 4 }} />;
  if (status !== "authenticated" || session?.user?.role !== "ADMIN") {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="text.secondary">You&apos;re not authorized to view this page.</Typography>
      </Box>
    );
  }
  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }
  if (!users) return <CircularProgress sx={{ m: 4 }} />;

  return (
    <Box sx={{ maxWidth: 800, mx: "auto", p: { xs: 2, md: 4 } }}>
      <Typography variant="h5" gutterBottom>Users</Typography>
      {actionError && (
        <Alert severity="error" onClose={() => setActionError(null)} sx={{ mb: 2 }}>
          {actionError}
        </Alert>
      )}
      <TextField
        size="small"
        label="Search name or email"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 3, minWidth: 280 }}
      />
      {users.length === 0 ? (
        <Typography color="text.secondary">No users match that search.</Typography>
      ) : (
        <List disablePadding>
          {users.map((user, index) => (
            <Box key={user.id}>
              <AdminUserRow
                user={user}
                isSelf={user.id === session.user.id}
                busy={busyId === user.id}
                onChangeRole={(id, role) => patchUser(id, { role })}
                onToggleActive={(id, active) => patchUser(id, { active })}
              />
              {index < users.length - 1 && <Divider component="li" />}
            </Box>
          ))}
        </List>
      )}
    </Box>
  );
}
