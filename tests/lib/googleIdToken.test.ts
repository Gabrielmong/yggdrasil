import { describe, it, expect, vi, afterEach } from "vitest";

const { verifyIdTokenMock } = vi.hoisted(() => ({ verifyIdTokenMock: vi.fn() }));

vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdTokenMock;
  },
}));

import { verifyGoogleIdToken } from "@/lib/googleIdToken";

afterEach(() => {
  vi.clearAllMocks();
});

describe("verifyGoogleIdToken", () => {
  it("returns the identity for a verified, email-verified token", async () => {
    verifyIdTokenMock.mockResolvedValue({
      getPayload: () => ({
        email: "person@example.com",
        email_verified: true,
        name: "Person Example",
        picture: "https://example.com/avatar.jpg",
      }),
    });

    const result = await verifyGoogleIdToken("valid-token");

    expect(result).toEqual({
      email: "person@example.com",
      name: "Person Example",
      picture: "https://example.com/avatar.jpg",
    });
  });

  it("returns null when the token's email is not verified", async () => {
    verifyIdTokenMock.mockResolvedValue({
      getPayload: () => ({ email: "person@example.com", email_verified: false }),
    });

    expect(await verifyGoogleIdToken("unverified-token")).toBeNull();
  });

  it("returns null when the payload has no email", async () => {
    verifyIdTokenMock.mockResolvedValue({
      getPayload: () => ({ email_verified: true }),
    });

    expect(await verifyGoogleIdToken("no-email-token")).toBeNull();
  });

  it("returns null when verification throws (invalid/expired/tampered token)", async () => {
    verifyIdTokenMock.mockRejectedValue(new Error("invalid signature"));

    expect(await verifyGoogleIdToken("bad-token")).toBeNull();
  });
});
