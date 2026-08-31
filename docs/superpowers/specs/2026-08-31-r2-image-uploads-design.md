# R2-Backed Image Uploads (Book Covers + Profile Pictures) — Design

Date: 2026-08-31
Status: Approved for planning

## Summary

Let signed-in users upload book cover images and profile pictures, stored
in a Cloudflare R2 bucket (S3-compatible object storage). Uploads are
processed server-side into three WebP sizes (small/medium/full) so the UI
can request the right size for each context instead of always loading a
full-resolution image. Uploaded images are identified by a generated UID
rather than a URL, kept separate from the existing hotlinked-URL fields
(`Book.coverUrl`, `User.image`) so nothing about the existing
Google-Books/Open-Library/Google-OAuth image flow changes.

## Goals

- Let any signed-in user upload a book's cover image, as an alternative
  to the existing "paste a URL" option in `BookEditForm`.
- Let a signed-in user upload their own profile picture, via a new
  minimal `/profile` page.
- Process every upload server-side into three WebP sizes (sm/md/full) so
  each UI context loads an appropriately-sized image.
- Keep uploaded images fully separate from hotlinked API/OAuth image
  URLs — uploading a cover never touches or requires touching
  `Book.coverUrl`, and uploading an avatar never touches `User.image`.

## Non-goals

- Direct browser→R2 upload (presigned URLs) — uploads proxy through our
  server, which also lets it run the image processing step.
- Editing/cropping UI — the uploaded image is resized (aspect preserved,
  not cropped) automatically; no user-facing crop tool.
- Deleting/garbage-collecting orphaned R2 objects when an image is
  replaced — out of scope for v1; a follow-up cleanup job can be added
  later if storage cost becomes a concern.
- Video, GIF, or any non-static-image upload.
- Editing a profile's `name` — the `/profile` page is avatar-only for v1.
- Any extra permission gating beyond "signed in" — same posture as the
  rest of the app's edit surfaces.

## Data Model

```prisma
model Book {
  // ...existing fields (id, isbn, title, authors, coverUrl, description,
  // genres, tags, pageCount, publishedYear, source, rawResponse,
  // fetchedAt, userBooks, edits) unchanged...
  coverImageId String?   // NEW: uid of an uploaded, processed cover image
}

model User {
  // ...existing fields (id, email, passwordHash, name, image,
  // emailVerified, createdAt, accounts, sessions, userBooks, bookEdits)
  // unchanged...
  avatarImageId String?  // NEW: uid of an uploaded, processed avatar
}
```

Both new fields are nullable and additive — no migration of existing
data, no change to any existing field's meaning. `coverImageId` /
`avatarImageId` take priority over `coverUrl` / `image` when resolving
what to actually display (see Frontend Resolution below); when null, the
existing hotlinked-URL behavior is unchanged.

## Upload Pipeline

### `POST /api/uploads`

- Requires an authenticated session (401 otherwise).
- Accepts `multipart/form-data` with fields `file` (the image) and
  `purpose` (`"book-cover" | "avatar"` — used only for request-level
  bookkeeping/logging in v1, not for the storage key; see below).
- Server-side validation (never trust client-side checks alone):
  content-type must be `image/jpeg`, `image/png`, or `image/webp`; size
  must be ≤ 5MB.
- Generates `uid = randomUUID()`.
- Uses `sharp` to produce three WebP buffers from the uploaded image,
  each resized so its longest edge is capped (aspect ratio preserved,
  never cropped, never upscaled past the source's own size):
  - `sm`: 150px
  - `md`: 500px
  - `full`: 1200px
- Uploads all three to the R2 bucket as flat keys (no folder prefix
  needed — the UID is already globally unique):
  - `${uid}-sm.webp`
  - `${uid}-md.webp`
  - `${uid}-full.webp`
- Returns `{ uid }` — **not** a URL. The client is responsible for
  persisting this `uid` via the appropriate existing/new save action
  (see below).

### `lib/storage/r2.ts`

Thin wrapper around `@aws-sdk/client-s3` (R2 is S3-compatible),
configured from env vars. Exposes a single function:
`uploadImage(key: string, buffer: Buffer, contentType: string): Promise<void>`.
No validation or business logic here — pure upload mechanics.

### Env vars (new)

`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET_NAME`, `R2_PUBLIC_URL` (the base URL the bucket's objects are
publicly reachable at — either R2's own `.r2.dev` public URL or a custom
domain, either way just a string this app treats as a base to append the
object key to).

## Saving an Uploaded Image

### Book covers

`BookEditForm` gains an upload option alongside the existing "Cover
image URL" text field. On successful upload, the returned `uid` is saved
via the **existing** `PATCH /api/books/[id]` route (Task 3 of the prior
feature), extended to also accept an optional `coverImageId` field
(alongside the existing `description`/`tags`/`coverUrl`). This means an
uploaded cover automatically gets the same `BookEdit` history/undo
treatment as any other edit — no new edit-tracking logic needed.

### Profile pictures

### `PATCH /api/profile` (new)

- Requires an authenticated session.
- Body: `{ avatarImageId: string }`.
- Updates the current user's `User.avatarImageId`.
- Returns the updated user (`id`, `name`, `image`, `avatarImageId`).

No edit-history tracking for profile changes — that mechanism is
specific to the shared `Book` repository; a user's own profile picture
is private to them, so a simple direct update is sufficient.

## Frontend Resolution

### `lib/storage/resolveImageUrl.ts` (new, pure function)

```typescript
export type ImageSize = "sm" | "md" | "full";

export function resolveImageUrl(
  imageId: string | null,
  fallbackUrl: string | null,
  size: ImageSize
): string | null {
  if (imageId) {
    return `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${imageId}-${size}.webp`;
  }
  return fallbackUrl;
}
```

Used at the **page level**, before handing a plain `coverUrl` string down
to existing display components — `BookDetailHeader.tsx`, `GenreTagList.tsx`,
and `BookCard.tsx` are **not modified** by this feature; their existing
`coverUrl: string | null` prop contract is unchanged. The resolution
happens in:

- `app/bookshelf/page.tsx` — resolves each book's cover at `"sm"` before
  passing it into `BookCard`.
- `app/books/[id]/page.tsx` — resolves the book's cover at `"md"` before
  passing it into `BookDetailHeader`.
- `app/profile/page.tsx` (new) — resolves the current user's avatar at
  `"full"` for display on the profile page itself; anywhere else in the
  app that shows a user's avatar in miniature (e.g. a future friends
  list) would resolve at `"sm"`, but no such surface exists yet in this
  app, so only the profile page needs this in v1.

This requires `NEXT_PUBLIC_R2_PUBLIC_URL` (a client-exposed mirror of
`R2_PUBLIC_URL`, same value) since `resolveImageUrl` runs in client
components.

## UI

### `components/ImageUploadButton.tsx` (new)

Small reusable component: a button + hidden file input. On file
selection, validates type/size client-side (fast feedback; the server
re-validates regardless), uploads to `POST /api/uploads` with the given
`purpose`, and calls `onUploaded(uid: string)` on success. Shows a loading
state during upload and an error message on failure.

### `app/profile/page.tsx` (new)

Minimal page: current avatar (resolved at `"full"`, with a fallback
placeholder when `avatarImageId` and `image` are both null), an
`ImageUploadButton` with `purpose="avatar"`, and a "Save" button that
calls `PATCH /api/profile` with the newly uploaded `uid`.

### `components/AppHeader.tsx` (modified)

Adds a small nav link/icon to `/profile` — there is currently no way to
reach it.

## Error Handling

- Non-image content-type or file over 5MB → `POST /api/uploads` returns
  `400` with a clear message; `ImageUploadButton` surfaces it.
- Upload succeeds but the subsequent save (`PATCH /api/books/[id]` or
  `PATCH /api/profile`) fails → the existing error-handling pattern in
  each consuming form applies (already hardened for network failures per
  the prior feature's final-review fix wave).
- R2 upload itself fails (network/credentials issue) → `POST /api/uploads`
  returns `500`; `ImageUploadButton` shows a generic "Upload failed,
  please try again" message.

## Testing

- Unit tests for `resolveImageUrl` (pure function, easy to test: with/
  without `imageId`, each size, `fallbackUrl` passthrough when
  `imageId` is null).
- No unit tests for the `sharp`-based resize pipeline itself (would
  require binary image fixtures and isn't pure logic) — verified
  manually during implementation instead, consistent with how the rest
  of the app's I/O-heavy code (external API clients, R2 upload) is
  handled: unit-test the pure logic around it, manually verify the I/O.
