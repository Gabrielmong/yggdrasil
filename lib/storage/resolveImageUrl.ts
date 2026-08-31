export type ImageSize = "sm" | "md" | "full";
export type ImageFolder = "covers" | "profilepictures";

/** Resolves the URL to display for an image: a sized, folder-prefixed R2
 * URL when an uploaded image's uid is present, otherwise the hotlinked
 * fallback URL (from an API source or OAuth provider) as-is. */
export function resolveImageUrl(
  imageId: string | null,
  fallbackUrl: string | null,
  size: ImageSize,
  folder: ImageFolder
): string | null {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  if (imageId && base) {
    return `${base}/${folder}/${imageId}-${size}.webp`;
  }
  return fallbackUrl;
}
