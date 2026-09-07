import { describe, it, expect } from "vitest";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import type { Session } from "next-auth";

function sessionWith(role: "USER" | "ADMIN", id = "user-1"): Session {
  return {
    user: { id, role, name: "Test", email: "test@example.com", image: null },
    expires: "2099-01-01T00:00:00.000Z",
  };
}

describe("requireAdmin", () => {
  it("returns a 401 response when there is no session", async () => {
    const result = requireAdmin(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(await result.response.json()).toEqual({ error: "Unauthorized" });
    }
  });

  it("returns a 401 response when the session has no user id", async () => {
    const result = requireAdmin({ user: { role: "ADMIN" }, expires: "2099-01-01T00:00:00.000Z" } as unknown as Session);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("returns a 403 response when the session user is not an admin", async () => {
    const result = requireAdmin(sessionWith("USER"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect(await result.response.json()).toEqual({ error: "Forbidden" });
    }
  });

  it("returns ok with the caller's user id when the session user is an admin", () => {
    const result = requireAdmin(sessionWith("ADMIN", "admin-1"));
    expect(result).toEqual({ ok: true, userId: "admin-1" });
  });
});
