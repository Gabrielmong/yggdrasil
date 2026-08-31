# Genre & Tag Normalization — Design

Date: 2026-08-31
Status: Approved for planning

## Summary

Replaces `Book.genres`/`Book.tags` (free-text `String[]` columns, one raw
string per source-API category or user-typed tag) with normalized `Genre`
and `Tag` entities, each in a many-to-many relation with `Book`. A one-time
backfill clusters existing raw strings into canonical entities using the
Anthropic API (already configured in this project); an ongoing resolver
keeps new genres/tags from re-fragmenting the same way going forward. This
also fixes the root cause of the comparison-chart noise problem solved
band-aid-style by the [Friends & Comparison Charts
feature](2026-08-31-friends-and-comparison-charts-design.md)'s top-12 cap:
real deduplication instead of a display-layer truncation.

## Goals

- `Genre` and `Tag` become first-class entities with a many-to-many
  relation to `Book`, replacing the raw `String[]` columns.
- A one-time backfill script clusters every existing raw genre/tag string
  into canonical entities via one LLM clustering pass per list (genres,
  tags), not one call per book.
- An ongoing resolver (`lib/genres/resolveOrCreate.ts`) handles every
  future raw string the same way: exact-match first, LLM fuzzy-match
  against the existing canonical list on a miss, create new only if
  genuinely novel.
- Book lookup (`/api/books/lookup`, `/api/books/manual`), the existing
  Claude-assisted backfill (`scripts/backfill-books.ts`), and book editing
  (`BookEditForm`) all route genre/tag writes through the resolver.
- `BookEditForm` gains genre editing (not previously part of
  `EditableBookFields`) alongside tag editing, both as autocomplete
  multi-selects against the new entities, replacing the current
  comma-separated text inputs.
- Bookshelf search/filter and the comparison charts keep working against
  denormalized name arrays in API responses — minimal change to their
  existing string-matching logic.
- `Book.genres`/`Book.tags` columns are dropped once the backfill and
  cutover are verified — a separate, explicitly-confirmed final step
  (destructive, not bundled into the main rollout).

## Non-goals

- A curated/admin-gated taxonomy — genres get the same open,
  community-editable philosophy tags already have in this app; no
  approval workflow for new canonical entities.
- Merging/renaming canonical entities after the fact via an admin UI (a
  future feature if duplicates still slip through despite the resolver).
- Changing how `tags`/`genres` are weighted or displayed anywhere beyond
  what's needed to keep existing features (search, comparison charts,
  edit history) working against the new data shape.
- Reworking `computeBookEditDiff`/`computeRevertDiff` — they already
  operate on plain name arrays and need no change; only the PATCH route's
  read/write around them changes.

## Data Model

```prisma
model Genre {
  id    String @id @default(cuid())
  name  String @unique

  books BookGenre[]
}

model Tag {
  id    String @id @default(cuid())
  name  String @unique

  books BookTag[]
}

model BookGenre {
  bookId  String
  genreId String

  book  Book  @relation(fields: [bookId], references: [id], onDelete: Cascade)
  genre Genre @relation(fields: [genreId], references: [id], onDelete: Cascade)

  @@id([bookId, genreId])
}

model BookTag {
  bookId String
  tagId  String

  book Book @relation(fields: [bookId], references: [id], onDelete: Cascade)
  tag  Tag  @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([bookId, tagId])
}
```

`Book` gains `genres BookGenre[]` and `tags BookTag[]` relations
(replacing, then — in the final step — outright removing, the
`genres`/`tags` `String[]` columns). Both `Genre.name` and `Tag.name` are
unique, case-sensitive at the DB level; the resolver enforces
case-insensitive matching in application code before ever attempting a
create.

## Canonicalization

### One-time backfill (`scripts/backfill-genres-tags.ts`)

Follows the existing `scripts/backfill-books.ts` conventions exactly:
`dotenv/config`, `ANTHROPIC_API_KEY`-gated (`anthropic ? ... : null`), a
`--dry-run`-equivalent env flag, per-item try/catch with console logging,
`prisma.$disconnect()` in a `finally`.

1. Query every `Book` row's `genres`/`tags` arrays, flatten and dedupe
   into two lists of distinct raw strings (genres, tags), case-preserved.
2. For each list (if non-empty and Claude is configured): one
   `anthropic.messages.create` call — prompt: "cluster these raw
   genre/tag labels into canonical categories; merge translations, case
   variants, and near-synonyms; return JSON
   `{ clusters: { canonical: string, raw: string[] }[] }`." Parse
   defensively (same guarded-JSON-parse pattern as
   `parseGeneratedMetadata`); any raw string absent from a valid cluster
   in the response gets its own canonical entity (safe default, never
   drops a label).
   - If Claude isn't configured, fall back to exact-match-only clustering
     (trim + case-fold) done in plain JS — still a real backfill, just
     without fuzzy merging.
3. Upsert one `Genre`/`Tag` row per canonical name (case-insensitive
   dedupe against rows already created by a prior partial run).
4. Build a raw→canonical id lookup from the clusters, then walk every
   `Book` and create the corresponding `BookGenre`/`BookTag` rows for its
   raw genres/tags (skip rows that already exist — idempotent, re-runnable
   on a partial failure).

### Ongoing resolver (`lib/genres/resolveOrCreate.ts`)

```typescript
export async function resolveOrCreateGenre(rawName: string): Promise<{ id: string; name: string }>
export async function resolveOrCreateTag(rawName: string): Promise<{ id: string; name: string }>
```

1. Trim the input; case-insensitive exact match against existing
   `Genre`/`Tag` rows — return immediately on a hit.
2. On a miss, if Claude is configured: fetch the current canonical name
   list (capped — this is a personal-scale app, a few hundred entries at
   most) and ask "does this raw label mean the same as one of these
   existing canonical names? Return the matching name, or null if it's
   genuinely new." A match resolves to that existing entity; `null`
   (or an LLM-call failure) falls through to step 3.
3. Create a new `Genre`/`Tag` row with the (trimmed) raw name. On a
   unique-constraint violation (race with a concurrent resolve), re-fetch
   the now-existing row by name instead of erroring.

Every write path funnels through this resolver — book lookup, manual
entry, book editing, and the existing Claude-assisted
`scripts/backfill-books.ts` (updated to call it instead of writing raw
arrays directly).

## Touch Points

- **`app/api/books/lookup/route.ts`, `app/api/books/manual/route.ts`** —
  resolve each provider-returned/typed raw genre through
  `resolveOrCreateGenre`, connect the resulting `BookGenre` rows on
  create (tags aren't part of automatic lookup today and stay that way —
  only user-entered via editing/manual-entry).
- **`lib/books/bookEditDiff.ts`** — unchanged. `EditableBookFields` gains
  a `genres: string[]` field (new — genres were never part of the
  open-edit/history system before); the diff logic itself already handles
  arbitrary string-array fields.
- **`app/api/books/[id]/route.ts` (PATCH)** — reads `book.genres`/`tags`
  via the join relations into name arrays for the "current" side of the
  diff (as before); on write, resolves each submitted name through the
  resolver, then syncs `BookGenre`/`BookTag` rows (disconnect removed,
  connect/create added) instead of updating a raw column.
- **`components/BookEditForm.tsx`, `components/ManualBookForm.tsx`** —
  tags (and, new, genres) become autocomplete multi-selects (MUI
  `Autocomplete` with `freeSolo`) backed by new `GET /api/genres?q=` /
  `GET /api/tags?q=` search endpoints, replacing the comma-separated
  `TextField`s.
- **`scripts/backfill-books.ts`** — its Claude-generated `genres`/`tags`
  route through `resolveOrCreateGenre`/`resolveOrCreateTag` instead of
  being written as raw arrays.
- **Bookshelf search/filter (`app/bookshelf/page.tsx`), comparison stats
  (`lib/friends/compareStats.ts` via `GET /api/friends/[userId]/compare`,
  `GET /api/user-books`)** — API responses denormalize the joins back to
  `genres: string[]`/`tags: string[]` on each book, so existing
  client-side string-matching/frequency logic needs no change. This also
  removes the genre-noise root cause the top-12 chart cap was band-aiding
  — real dedup means far fewer, far more meaningful categories.
- **Final step (separate, explicitly confirmed, not auto-run):** drop
  `Book.genres`/`Book.tags` columns via a follow-up migration once the
  backfill and cutover are verified.

## Error Handling

- LLM call failure (backfill clustering, or the resolver's fuzzy-match
  step) never blocks the operation — falls back to exact-match-only /
  verbatim-new-entity creation, mirroring `scripts/backfill-books.ts`'s
  existing `anthropic ? ... : null` pattern.
- Malformed/unparseable LLM clustering JSON — guarded parse (same style
  as `parseGeneratedMetadata`); any raw string not covered by a valid
  cluster becomes its own canonical entity rather than being dropped.
- Concurrent resolve-or-create race on the same new name — unique
  constraint throws, caught and resolved by re-fetching the row.
- Autocomplete free-text entry of a brand-new value goes through the
  same resolver as every other path — no separate approval step,
  consistent with this app's existing open-editing philosophy.

## Testing

- `lib/genres/resolveOrCreate.ts`'s exact-match path and JSON-parsing/
  fallback logic get unit tests with a mocked Anthropic client
  (`vi.hoisted`/`vi.mock`, matching the existing `google-auth-library`
  mocking pattern in this codebase).
- The backfill script's clustering-response parser gets the same
  fixture-based unit tests `parseGeneratedMetadata` would (valid
  response, malformed JSON, empty list).
- Everything else (routes, forms, the backfill script's DB effects) stays
  manual-verification-only, matching this codebase's established
  convention — no API route test suite exists anywhere in this app.
