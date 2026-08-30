# Yggdrasil — Reading Tracker Design

Date: 2026-08-30
Status: Approved for planning

## Summary

A small Next.js + TypeScript app for tracking books you've read, want to
read, or are currently reading. Users log in with Google or a regular
email/password account. Scanning a book's barcode with the device camera
looks up its ISBN against Google Books / Open Library, caches the result
in Postgres, and adds it to the user's shelf. Friends (mutual, request/
accept) can see each other's shelves and compare genre/author stats via
charts. UI uses MUI with a moss-green palette and light/dark mode.

## Goals

- Track books by reading state: Want to Read / Reading / Read.
- Scan a barcode → resolve ISBN → fetch title/cover/description/authors/
  genres → cache → add to shelf, with manual entry as a fallback.
- Never re-call the lookup APIs for a book already seen by any user.
- Personal charts: genres, authors, books-read-over-time, rating by genre.
- Mutual friends who can view each other's shelves and compare their
  genre/author distributions side by side.
- Clean, pleasant MUI UI, moss-green palette, dark mode support.

## Non-goals (v1)

- Native mobile app (browser camera access only).
- Normalized/curated genre taxonomy (raw strings from source APIs).
- Public/anonymous browsing, one-way follows, or friend recommendations.
- Rehosting cover images (hotlinked from source APIs for v1).
- Similarity scoring for comparisons (just distributions + overlap list).
- Automated component/e2e tests (manual verification for v1; unit tests
  only for pure logic).

## Tech Stack

- **Framework:** Next.js (App Router) + TypeScript
- **UI:** MUI (Material UI) + MUI X Charts, moss-green theme, light/dark
  mode
- **Auth:** Auth.js (NextAuth v5) — Google provider + Credentials provider
  (bcrypt password hashing), Prisma adapter
- **DB/ORM:** PostgreSQL + Prisma
- **Barcode scanning:** `@zxing/browser` reading EAN-13 via device camera
  (`getUserMedia`)
- **External APIs:** Google Books API (primary), Open Library API
  (fallback/gap-filling)
- **Deployment target:** Vercel + hosted Postgres (Neon or Supabase)

## Data Model (Prisma)

In addition to the standard Auth.js tables (Account, Session,
VerificationToken):

```prisma
model User {
  id            String       @id @default(cuid())
  email         String       @unique
  passwordHash  String?      // null for Google-only accounts
  name          String?
  image         String?
  createdAt     DateTime     @default(now())

  userBooks     UserBook[]
  sentRequests  Friendship[] @relation("Requester")
  receivedRequests Friendship[] @relation("Addressee")
}

model Book {
  id            String    @id @default(cuid())
  isbn          String    @unique
  title         String
  authors       String[]
  coverUrl      String?
  description   String?
  genres        String[] // raw subjects/categories from source API
  pageCount     Int?
  publishedYear Int?
  source        BookSource
  rawResponse   Json?
  fetchedAt     DateTime  @default(now())

  userBooks     UserBook[]
}

enum BookSource {
  GOOGLE_BOOKS
  OPEN_LIBRARY
  MANUAL
}

model UserBook {
  id         String       @id @default(cuid())
  userId     String
  bookId     String
  status     ReadStatus
  rating     Int?         // 1-5, only meaningful when status = READ
  notes      String?
  startedAt  DateTime?
  finishedAt DateTime?
  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt

  user       User         @relation(fields: [userId], references: [id])
  book       Book         @relation(fields: [bookId], references: [id])

  @@unique([userId, bookId])
}

enum ReadStatus {
  WANT_TO_READ
  READING
  READ
}

model Friendship {
  id           String           @id @default(cuid())
  requesterId  String
  addresseeId  String
  status       FriendshipStatus
  createdAt    DateTime         @default(now())

  requester    User             @relation("Requester", fields: [requesterId], references: [id])
  addressee    User             @relation("Addressee", fields: [addresseeId], references: [id])

  @@unique([requesterId, addresseeId])
}

enum FriendshipStatus {
  PENDING
  ACCEPTED
  DECLINED
}
```

Notes:
- `Book` is a shared snapshot keyed by ISBN — one row per book across all
  users, which is what avoids repeat external API calls.
- `genres` stays free-text (Google Books `categories` / Open Library
  `subjects`); no normalized Genre table in v1.
- A `Friendship` is queried symmetrically once `ACCEPTED` — either user ID
  can appear as requester or addressee when checking "are these two
  friends."

## Scan → Lookup Pipeline

1. **Scanner UI** (`/scan`, client component): opens the camera via
   `@zxing/browser`, decodes an EAN-13 barcode from the live video
   stream. A book's EAN-13 barcode value *is* its ISBN-13, so the decoded
   code is used directly.
2. **`GET /api/books/lookup?isbn=...`**
   - Look up `Book` by `isbn` (unique index) — on hit, return
     immediately. No external call.
   - On miss, call Google Books
     (`https://www.googleapis.com/books/v1/volumes?q=isbn:{isbn}`). If it
     returns a usable result (title present), map fields into the `Book`
     shape.
   - If Google Books returns nothing, or is missing fields (no cover, no
     description), call Open Library
     (`https://openlibrary.org/api/books?bibkeys=ISBN:{isbn}&jscmd=data`
     + the covers API for the image) and merge in whatever fields it can
     fill.
   - Upsert the merged result into `Book` (source = whichever provided
     the title, or `GOOGLE_BOOKS` if both contributed).
   - If neither source returns anything usable: respond 404.
3. **Manual fallback**: on a 404 (or a bad/unreadable scan), the UI shows
   a form to either type the ISBN manually (re-hits the same lookup
   route) or fill in title/authors/etc. by hand, saved as a `Book` with
   `source = MANUAL` and no `rawResponse`.
4. **`POST /api/user-books`**: given a `bookId` and a `status`, upserts
   the `UserBook` row for the current user (unique on `userId`+`bookId`)
   — this is the "add to shelf" action, used identically whether the
   book came from cache, a fresh API call, or manual entry.

Because lookups are cached permanently by ISBN and shared across all
users, no separate rate-limiting is needed for v1 — repeat scans of a
popular book never re-hit the external APIs after the first user adds it.

## Social & Charts

**Friends:** search users by name/email → `POST /api/friendships` creates
a `PENDING` row (current user as requester). The addressee sees pending
requests in a panel and can accept (→ `ACCEPTED`) or decline (→
`DECLINED`). Once `ACCEPTED`, either user can view the other's profile.

**Friend profile view:** the friend's bookshelf (grouped by status tabs)
and their personal stats, reusing the same components as the "own
profile" view but read-only.

**Comparison view:** pick two accepted friends (defaulting to
self-vs-one-friend); compute genre and author frequency for each from
their `READ` `UserBook`s, render as side-by-side `BarChart`s (MUI X
Charts), plus a plain-list "genres/authors you both have" (set
intersection). No weighting/similarity scoring.

**Personal charts (own profile):**
- Genre breakdown — pie or bar chart of genre frequency across `READ`
  books.
- Top authors — bar chart of author frequency.
- Books read over time — bar/line chart bucketed by `finishedAt` month.
- Average rating by genre — bar chart.

**Bookshelf view:** grid of book cards grouped into Want to Read /
Reading / Read tabs; each card shows cover, title, author, and rating
(if `READ`). Clicking a card opens a detail page with description,
genres, personal notes, and start/finish dates (editable).

## UI / Theming

- MUI `ThemeProvider` + `CssBaseline`, custom palette built around a
  moss-green primary (e.g. `#4A5D45`-ish family — exact hex refined
  during implementation/frontend-design pass).
- Dark mode: initial mode from `prefers-color-scheme`, overridable via a
  manual toggle persisted in `localStorage`; palette `mode` switches
  between a light and dark variant of the moss-green theme.
- Charts (MUI X Charts) pull their colors from the active MUI theme so
  light/dark and the moss-green palette apply automatically.

## Error Handling

- Camera permission denied / no camera → show a message with a manual
  ISBN entry option, no dead-end.
- Barcode decodes to a non-ISBN value or lookup 404s → manual entry form
  (ISBN retype or full manual fields).
- External API timeout/error on one source → fall through to the other
  source rather than failing the whole lookup; if both fail, treat as a
  404 (manual entry).
- Duplicate friend request / already-friends → return a clear 409-style
  error, surfaced as a toast, not a crash.

## Phasing (implementation order)

1. **Phase 1 — Core:** auth (Google + Credentials), scan/lookup pipeline
   with manual-entry fallback, `UserBook` CRUD, bookshelf view, book
   detail page, base MUI theme (light/dark, moss-green).
2. **Phase 2 — Social:** friend search/request/accept, friend profile
   (read-only shelf view).
3. **Phase 3 — Insight:** personal charts, friend comparison charts.

Each phase is implementable and demoable on its own; Phase 1 alone is a
usable single-player reading tracker.

## Testing

- Unit tests for the lookup-merge logic (combining/backfilling Google
  Books + Open Library fields) — pure function, easy to test with fixture
  responses.
- Unit tests for stat/comparison aggregation (genre/author frequency,
  overlap computation) — pure functions over `UserBook[]` data.
- No component or e2e test suite in v1; flows verified manually during
  development.
