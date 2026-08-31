# Friends & Comparison Charts — Design

Date: 2026-08-31
Status: Approved for planning

## Summary

Implements the "Phase 2 — Social" slice of the original
[Yggdrasil design](2026-08-30-yggdrasil-reading-tracker-design.md): mutual
friends (search, request, accept/decline, unfriend), a friend's read-only
bookshelf, and — pulled forward from Phase 3 — genre/author comparison
charts between the current user and one friend. The full personal-charts
suite (own genre breakdown, books-read-over-time, rating-by-genre) stays
out of scope for this round.

## Goals

- Search other users by name/email and send a friend request.
- Accept, decline, cancel, or unfriend — the relationship is always
  reversible.
- View a friend's bookshelf (grouped by status, same layout as your own,
  read-only) once `ACCEPTED`.
- Compare genre and author frequency with a friend as side-by-side bar
  charts, plus a plain overlap list.
- Surface incoming pending requests in the header so they're not missed.

## Non-goals (this round)

- Personal-only charts (genre breakdown, top authors, books-read-over-time,
  rating-by-genre) for a user's own profile — separate future round.
- One-way follows, public/anonymous browsing, or friend recommendations
  (unchanged from the original spec's non-goals).
- Similarity scoring for comparisons — frequency + a plain overlap list
  only, no weighting.
- Comparing more than two users (self vs. one friend) at a time.

## Data Model

```prisma
model Friendship {
  id          String           @id @default(cuid())
  requesterId String
  addresseeId String
  status      FriendshipStatus
  createdAt   DateTime         @default(now())
  respondedAt DateTime?

  requester User @relation("FriendshipRequester", fields: [requesterId], references: [id], onDelete: Cascade)
  addressee User @relation("FriendshipAddressee", fields: [addresseeId], references: [id], onDelete: Cascade)

  @@unique([requesterId, addresseeId])
  @@index([addresseeId, status])
}

enum FriendshipStatus {
  PENDING
  ACCEPTED
  DECLINED
}
```

`User` gains:

```prisma
sentFriendRequests     Friendship[] @relation("FriendshipRequester")
receivedFriendRequests Friendship[] @relation("FriendshipAddressee")
```

One row per *ordered* pair (`requesterId`, `addresseeId`); "are these two
users friends" is checked symmetrically — either user ID may appear as
requester or addressee.

### Lifecycle

- **No existing row** between the two users → sending a request creates a
  new `PENDING` row (current user as requester).
- **Existing row is `DECLINED`** → sending a new request reuses that row:
  flips `status` back to `PENDING`, sets `requesterId`/`addresseeId` to the
  new direction, clears `respondedAt`, bumps `createdAt`. This sidesteps
  the unique-constraint collision a brand-new row would hit, and means a
  declined request isn't a dead end.
- **Existing row is `PENDING` or `ACCEPTED`** (in either direction) →
  409, "already friends" or "request already pending".
- **Cancel** (requester only, while `PENDING`) → delete the row. Frees the
  pair for a future request.
- **Accept** (addressee only, while `PENDING`) → `status = ACCEPTED`,
  `respondedAt = now()`.
- **Decline** (addressee only, while `PENDING`) → `status = DECLINED`,
  `respondedAt = now()`. Row is kept (see reuse case above).
- **Unfriend** (either party, while `ACCEPTED`) → delete the row.

## API Routes

All routes require a session; unauthenticated → 401, matching every other
route in the app.

- **`GET /api/users/search?q=`** — case-insensitive name/email search,
  excludes the current user. Each result carries a computed
  `relationship: "NONE" | "PENDING_OUTGOING" | "PENDING_INCOMING" |
  "FRIENDS"` so the UI can render the right action (Add / Pending /
  Friends) without a second round trip.
- **`POST /api/friendships`** — body `{ addresseeId }`. Applies the
  lifecycle rules above; 400 if `addresseeId` is missing, malformed, or
  equal to the current user's own ID; 404 if the addressee doesn't exist;
  409 per the lifecycle rules.
- **`GET /api/friendships`** — the current user's relationships, split
  into three arrays: `friends` (`ACCEPTED`), `incoming` (`PENDING`,
  current user is addressee), `outgoing` (`PENDING`, current user is
  requester). Each entry includes the other user's `id`, `name`, `email`,
  and resolved avatar fields.
- **`PATCH /api/friendships/[id]`** — body `{ action: "accept" |
  "decline" }`. 403 unless the current user is the addressee of a
  `PENDING` row; 404 if the row doesn't exist.
- **`DELETE /api/friendships/[id]`** — cancels a `PENDING` request
  (403 unless current user is the requester) or removes an `ACCEPTED`
  friendship (either party may call it); 404 if the row doesn't exist.
- **`GET /api/friends/[userId]/books`** — the target user's `UserBook`s
  in the same shape `GET /api/user-books` already returns. 403 unless an
  `ACCEPTED` `Friendship` exists between the current user and `userId`;
  404 if `userId` doesn't exist.
- **`GET /api/friends/[userId]/compare`** — computes, from both users'
  `READ` books: genre frequency and author frequency (each as
  `{ name, count }[]`, current user vs. friend), plus `sharedGenres` and
  `sharedAuthors` (plain string arrays, set intersection). Same 403/404
  rules as the books route. Pure aggregation logic lives in
  `lib/friends/compareStats.ts` so it's unit-testable against fixture
  `UserBook[]` data, independent of Prisma.

## UI

- **`/friends`** (new top-level page, linked from the header):
  - Search box (name/email) → results list, each row showing name/avatar
    and a button reflecting `relationship` (Add friend / Request sent —
    disabled or Cancel / Already friends).
  - "Requests" section: incoming (Accept/Decline buttons) and outgoing
    (Cancel button) pending requests.
  - "Friends" section: list of accepted friends, each linking to
    `/friends/[userId]`, with a small Unfriend action.
- **`/friends/[userId]`** — read-only friend profile: name/avatar header,
  their bookshelf reusing the existing `BookCard` + status-tab layout
  (fetched from `GET /api/friends/[userId]/books`), and a "Compare" button
  to `/friends/[userId]/compare`. A non-friend visiting this URL directly
  gets a plain "not friends" message, not the shelf (mirrors the API's
  403).
- **`/friends/[userId]/compare`** — two side-by-side `BarChart`s (MUI X
  Charts, new dependency — installed but not yet used anywhere in the
  app) for genre frequency and author frequency, plus a plain list each
  for shared genres and shared authors. Uses the app's existing MUI theme
  so colors follow light/dark + the moss-green palette automatically, per
  the original spec's charts note.
- **Header** (`AppHeader.tsx`): a People icon linking to `/friends`, with
  a small badge showing the incoming-pending count (0 → no badge).
  Fetched alongside the existing avatar fetch-on-sign-in effect.

## Error Handling

- Duplicate/already-friends/self-request → 409/400, surfaced as an inline
  error near the search result or request button, not a crash (matches
  the original spec's "clear 409-style error, surfaced as a toast, not a
  crash" — here as inline text, consistent with how errors are already
  shown elsewhere in this app, e.g. `BookEditForm`, `IsbnLookupForm`).
- Visiting a friend's profile/books/compare route without an `ACCEPTED`
  friendship → 403 from the API, rendered as a plain "not friends"
  message client-side (same pattern `app/books/[id]/page.tsx` uses for
  "not on your shelf").
- A friend who unfriends you mid-session: the next fetch against
  `/api/friends/[userId]/*` 403s and the UI falls back to the "not
  friends" message rather than erroring.

## Testing

- `lib/friends/compareStats.ts` (genre/author frequency + overlap
  computation) gets unit tests against fixture `UserBook[]`-shaped data,
  matching the existing pattern for other pure logic in this codebase
  (`bookEditDiff.ts`, `searchUtils.ts`).
- Friendship lifecycle rules (create/reuse-declined/cancel/accept/
  decline/unfriend) are exercised through the route handlers; given the
  codebase has no existing API route test suite (confirmed: none of the
  book/user-books/profile routes have tests either), this stays manual
  verification during implementation, consistent with existing practice.
