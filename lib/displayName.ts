/** Fallback label for a user with no display name set. Never falls back
 * to their email address — another user's email should only ever be
 * visible on their own profile page, nowhere a *different* user can see
 * it (search results, friend requests, a friend's page, etc). */
export const ANONYMOUS_NAME = "Reader";

export function displayName(name: string | null): string {
  return name ?? ANONYMOUS_NAME;
}

export function displayInitial(name: string | null): string {
  return displayName(name).charAt(0).toUpperCase();
}
