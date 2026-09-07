import { NextResponse } from "next/server";
import type { Session } from "next-auth";

export type AdminGuardResult = { ok: true; userId: string } | { ok: false; response: NextResponse };

/** Given the current request's already-resolved session, decides whether
 * the caller may proceed to an admin-only route: a 401 response if not
 * signed in, a 403 response if signed in but not an ADMIN, otherwise the
 * caller's own user id (routes that must block an admin from acting on
 * their own account use this). Pure — takes the resolved session instead
 * of calling next-auth's `auth()` itself, so it's unit-testable without
 * a request context. */
export function requireAdmin(session: Session | null): AdminGuardResult {
  if (!session?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.user.role !== "ADMIN") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, userId: session.user.id };
}
