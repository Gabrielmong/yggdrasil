import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveImageUrl } from "@/lib/storage/resolveImageUrl";

describe("resolveImageUrl", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_URL", "https://images.example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds a sized, folder-prefixed R2 URL when imageId is present", () => {
    expect(resolveImageUrl("abc123", null, "sm", "covers")).toBe(
      "https://images.example.com/covers/abc123-sm.webp"
    );
    expect(resolveImageUrl("abc123", null, "md", "covers")).toBe(
      "https://images.example.com/covers/abc123-md.webp"
    );
    expect(resolveImageUrl("abc123", null, "full", "covers")).toBe(
      "https://images.example.com/covers/abc123-full.webp"
    );
  });

  it("uses the profilepictures folder for avatars", () => {
    expect(resolveImageUrl("abc123", null, "full", "profilepictures")).toBe(
      "https://images.example.com/profilepictures/abc123-full.webp"
    );
  });

  it("prefers imageId over fallbackUrl when both are present", () => {
    expect(resolveImageUrl("abc123", "https://example.com/hotlinked.jpg", "sm", "covers")).toBe(
      "https://images.example.com/covers/abc123-sm.webp"
    );
  });

  it("returns fallbackUrl when imageId is null", () => {
    expect(resolveImageUrl(null, "https://example.com/hotlinked.jpg", "sm", "covers")).toBe(
      "https://example.com/hotlinked.jpg"
    );
  });

  it("returns null when both imageId and fallbackUrl are null", () => {
    expect(resolveImageUrl(null, null, "sm", "covers")).toBeNull();
  });

  it("returns fallbackUrl when imageId is present but NEXT_PUBLIC_R2_PUBLIC_URL is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_URL", "");
    expect(resolveImageUrl("abc123", "https://example.com/hotlinked.jpg", "sm", "covers")).toBe(
      "https://example.com/hotlinked.jpg"
    );
  });
});
