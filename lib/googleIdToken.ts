import { OAuth2Client } from "google-auth-library";

export interface GoogleIdentity {
  email: string;
  name: string | null;
  picture: string | null;
}

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Verifies a Google Identity Services ID token (from the GSI button/One Tap
 * flow) against Google's public keys, and extracts the caller's verified
 * identity. Returns null for any invalid, expired, tampered, or
 * unverified-email token.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity | null> {
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified) return null;

    return {
      email: payload.email,
      name: payload.name ?? null,
      picture: payload.picture ?? null,
    };
  } catch {
    return null;
  }
}
