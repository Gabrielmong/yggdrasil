const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates that a string is a UUID — the only shape coverImageId/avatarImageId
 * should ever hold, since it's always server-generated via randomUUID() and
 * gets interpolated directly into an R2 URL path. */
export function isValidImageId(value: string): boolean {
  return UUID_RE.test(value);
}
