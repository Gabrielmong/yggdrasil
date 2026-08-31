"use client";

import { useState, useEffect, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Box, Button, TextField, Typography, Divider, Alert, Paper } from "@mui/material";
import Link from "next/link";
import GoogleSignInButton from "@/components/GoogleSignInButton";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  OAuthAccountNotLinked:
    "This email is already registered with a different sign-in method. Try signing in with your password instead.",
};

function describeOAuthError(code: string): string {
  return OAUTH_ERROR_MESSAGES[code] ?? "Something went wrong signing you in. Please try again.";
}

function OAuthErrorAlert({ onError }: { onError: (message: string) => void }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const oauthError = searchParams.get("error");
    if (oauthError) {
      onError(describeOAuthError(oauthError));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return null;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const result = await signIn("credentials", { email, password, redirect: false, callbackUrl: "/bookshelf" });
    if (result?.error) {
      setError("Invalid email or password");
    } else if (result?.url) {
      window.location.href = result.url;
    }
  }

  return (
    <Box sx={{ maxWidth: 400, mx: "auto", mt: 8 }}>
      <Suspense fallback={null}>
        <OAuthErrorAlert onError={setError} />
      </Suspense>
      <Paper sx={{ p: 4 }}>
        <Typography variant="h5" gutterBottom>Sign in</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
          <GoogleSignInButton onError={setError} />
        </Box>
        <Divider sx={{ my: 2 }}>or</Divider>
        <Box component="form" onSubmit={handleCredentialsSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Button type="submit" variant="contained">Sign in</Button>
        </Box>
        <Typography sx={{ mt: 2 }}>
          No account? <Link href="/register">Register</Link>
        </Typography>
      </Paper>
    </Box>
  );
}
