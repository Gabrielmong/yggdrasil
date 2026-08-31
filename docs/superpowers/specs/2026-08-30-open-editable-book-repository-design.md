# Open, Editable Book Repository — Design

Date: 2026-08-30
Status: Approved for planning

## Summary

The `Book` table is currently a write-once cache: populated by the ISBN
lookup pipeline (Google Books + Open Library) or manual entry, and never
modified afterward. This feature turns it into an open, community-editable
repository — any signed-in user can improve a book's description, add
crowd-sourced tags, or fix its cover image, with every change logged and
revertible, similar in spirit to Open Library or a wiki.

## Goals

- Let any signed-in user edit a book's `description`, `tags`, and
  `coverUrl`.
- Add a separate, user-editable `tags` list distinct from the
  API-sourced `genres` field, so original API provenance is never
  overwritten by a crowd edit.
- Log every edit (who, when, what changed) so a bad or vandalizing edit
  can be undone.
- Surface the edit history and an "Undo" action on the book detail page.

## Non-goals

- Editing `title`, `authors`, `isbn`, `pageCount`, or `publishedYear` —
  these stay authoritative from the source API/manual entry for v1.
- Cover image upload/rehosting — cover edits are a pasted URL
  (hotlinked), consistent with the app's existing non-goal of not
  rehosting images.
- Any extra permission gating beyond "signed in" — no rate limiting,
  no reputation system, no moderation queue.
- Arbitrary point-in-time rollback across multiple edits — "Undo"
  reverts one specific edit's changed fields, not a full revision-tree
  checkout.
- Editing `genres` — that field remains exactly what the source API
  returned.

## Data Model

```prisma
model Book {
  // ...existing fields (id, isbn, title, authors, coverUrl, description,
  // genres, pageCount, publishedYear, source, rawResponse, fetchedAt,
  // userBooks) unchanged...
  tags  String[]    @default([])   // NEW: user-editable, separate from genres
  edits BookEdit[]                 // NEW
}

model BookEdit {
  id             String   @id @default(cuid())
  bookId         String
  editedById     String
  editedAt       DateTime @default(now())
  previousValues Json     // only the fields this edit changed, pre-edit values
  newValues      Json     // same fields, post-edit values

  book     Book @relation(fields: [bookId], references: [id], onDelete: Cascade)
  editedBy User @relation(fields: [editedById], references: [id])
}
```

`previousValues`/`newValues` are shaped like
`Partial<{ description: string | null; tags: string[]; coverUrl: string | null }>`
— only the keys that actually changed in that edit are present, so a
history entry reads as "changed description" or "changed tags, coverUrl"
rather than always dumping the whole record.

## API

### `PATCH /api/books/[id]`

Body: `{ description?: string | null; tags?: string[]; coverUrl?: string | null }`.

- Requires an authenticated session (401 otherwise) — no further
  permission check.
- Loads the current `Book` row; for each field present in the body,
  compares against the current value. If nothing actually changed
  (identical value resubmitted), returns the book unchanged with no new
  `BookEdit` row.
- Otherwise, in a single transaction: updates the `Book` row with the new
  values, and creates one `BookEdit` row with `previousValues` set to the
  old values of just the changed fields and `newValues` set to the new
  values of just those fields.
- Returns the updated `Book` row.

### `GET /api/books/[id]/edits`

- Requires an authenticated session.
- Returns the book's `BookEdit` rows ordered newest-first, each including
  the editor's `name`/`email` (whichever is available) for display.

### `POST /api/books/[id]/edits/[editId]/revert`

- Requires an authenticated session.
- Loads the target `BookEdit`; 404 if it doesn't exist or doesn't belong
  to the given book.
- Applies that edit's `previousValues` onto the `Book` row's current
  state (only the fields present in `previousValues`).
- Creates a **new** `BookEdit` row documenting the revert itself:
  `previousValues` = the book's values right before the revert (i.e. the
  edit being undone), `newValues` = the restored values — so the revert
  is itself part of the honest, append-only history, and can itself be
  undone.
- Returns the updated `Book` row.

## UI

### `components/BookEditForm.tsx` (new)

An explicit edit mode on the book detail page — a "Edit details" button
toggles `description`, `tags` (comma-separated input, consistent with how
`ManualBookEntry` already handles the `authors` field), and `coverUrl`
into editable fields, with "Save changes" and "Cancel" actions. Unlike
`BookStatusEditor` (which auto-saves the user's *personal* shelf data on
blur/change), this requires an explicit save — the data being changed
here is shared across every user, so an accidental keystroke shouldn't
silently commit.

### `components/BookTagList.tsx` (new)

Renders the `tags` chips, visually distinct from the existing
`GenreTagList`'s API-sourced `genres` chips (e.g. `variant="outlined"`
vs. the default filled genre chips) so it's visually clear which list is
API canon and which is crowd-added. Reuses the same collapse-when-long
behavior as `GenreTagList` (extract the shared "collapsible chip list"
logic into a common piece both components use, rather than duplicating
the collapse logic — see Testing/implementation notes).

### `components/BookEditHistory.tsx` (new)

A collapsible section listing past edits (editor name, relative
timestamp, a one-line summary of which fields changed) each with an
"Undo" button that calls the revert endpoint and refreshes the displayed
book data.

### `app/books/[id]/page.tsx` (modified)

Fetches the book's edit history alongside the existing `UserBook` fetch,
passes the book/tags/history down to the new components, and wires the
edit-mode toggle, save, and revert actions.

## Error Handling

- `PATCH`/`revert` on a book that doesn't exist → 404.
- No session → 401, redirect to `/login` client-side (matching the
  existing pattern in `BookStatusEditor`/`ManualBookEntry`).
- A `coverUrl` edit is not validated as a reachable image URL (matches
  the app's existing behavior for `manual` entries) — an obviously
  broken URL just fails to render an `<img>`, no server-side check.

## Testing

- Unit tests for the diff/patch logic that computes `previousValues`/
  `newValues` from a request body and the current `Book` row (pure
  function, extracted so it's testable without touching Prisma — e.g.
  `lib/books/diffBookEdit.ts`).
- Unit tests for the revert logic's "new BookEdit documents the revert
  itself" behavior (also a pure function operating on the target edit's
  stored values and the book's current values).
- No new e2e/component tests, consistent with the rest of the app's
  testing approach (manual verification for UI flows).
