# Friend Activity Feed — Design

Date: 2026-09-01
Status: Approved for planning

## Summary

Adds a chronological feed of friends' reading activity — starting a book,
finishing a book, rating a book — so the friends feature becomes something
worth checking regularly instead of only compare-on-demand. Builds on the
existing `Friendship`/`UserBook` model from
[Friends & Comparison Charts](2026-08-31-friends-and-comparison-charts-design.md).

## Goals

- Show a reverse-chronological feed of `ACCEPTED` friends' activity: started
  reading, finished, and rated a book.
- One dedicated `/activity` page, linked from the header, showing everyone's
  activity together (not scoped to a single friend).
- "Load more" pagination past the first page.
- Each entry links back to the book (`/books/[id]`).

## Non-goals (this round)

- Activity for "added to Want to Read" — highest-volume, lowest-signal event;
  left out to keep the feed low-noise.
- Comments, likes, or any interaction on feed entries.
- Real-time/push updates — the feed is fetched on page load, same as every
  other data-fetching page in this app (no websockets/polling exist anywhere
  yet).
- Retroactively backfilling `ActivityEvent` rows for existing `UserBook`
  history — the feed starts from whenever this ships; past status changes
  don't appear.
- A per-friend activity view (e.g. `/friends/[userId]/activity`) — only the
  combined `/activity` feed.

## Data Model

```prisma
enum ActivityEventType {
  STARTED_READING
  FINISHED
  RATED
}

model ActivityEvent {
  id        String            @id @default(cuid())
  userId    String
  bookId    String
  type      ActivityEventType
  rating    Int?
  createdAt DateTime          @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  book Book @relation(fields: [bookId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
}
```

`User` gains `activityEvents ActivityEvent[]`; `Book` gains
`activityEvents ActivityEvent[]`.

`rating` is only populated on `RATED` events (the rating value at the time,
1-5); `null` on `STARTED_READING`/`FINISHED`. `createdAt` is the event's own
timestamp — when the action was recorded — independent of the book's
editable `startedAt`/`finishedAt` fields on `UserBook` (which today can only
be set to "now" via the mark-as-started/finished actions, per the existing
known gap, but the feed doesn't rely on them either way). Rows are never
updated, only inserted; a later status change or re-rating produces a new
event rather than mutating an old one, so the feed reads as a true history
even as the underlying `UserBook` keeps changing.

## Event Creation

A pure helper, `lib/activity/recordActivityEvents.ts`:

```ts
function activityEventsFor(
  prev: { status: ReadStatus | null; rating: number | null },
  next: { status: ReadStatus; rating: number | null }
): { type: ActivityEventType; rating?: number }[]
```

Rules:

- `next.status === "READING"` and `prev.status !== "READING"` →
  `STARTED_READING`.
- `next.status === "READ"` and `prev.status !== "READ"` → `FINISHED`.
- `next.rating != null` and `next.rating !== prev.rating` → `RATED` (carries
  `next.rating`).

Multiple events can fire from one mutation (e.g. marking a book read with a
rating in the same request emits both `FINISHED` and `RATED`).

Wired into the two routes that mutate a `UserBook`:

- **`PATCH /api/user-books/[id]`** — the real source today. Diffs
  `existing.status`/`existing.rating` (already fetched for the ownership
  check) against the incoming values, then `prisma.activityEvent.createMany`
  for whatever `activityEventsFor` returns, alongside the `userBook.update`.
- **`POST /api/user-books`** — creates always use `status: "WANT_TO_READ"` in
  every current caller (`app/add/page.tsx`), so `activityEventsFor(null,
  next)` never actually produces an event today. Wired anyway with `prev:
  null` so the logic stays correct if a future caller ever creates directly
  into `READING`/`READ`.

Both call sites reuse the same helper — no event logic duplicated between
them.

## API Routes

- **`GET /api/activity?before=<eventId>`** — requires a session (401
  otherwise). Collects the current user's `ACCEPTED` friend IDs (same
  `symmetricPairWhere`-style lookup `lib/friends/friendshipWhere.ts` already
  centralizes), then:
  ```
  prisma.activityEvent.findMany({
    where: { userId: { in: friendIds }, ...(before && { createdAt: { lt: cursorEvent.createdAt } }) },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { user: { select: id, name, image, avatarImageId }, book: { select: id, title, authors, coverUrl, coverImageId } },
  })
  ```
  Returns `{ events, nextCursor }` where `nextCursor` is the last event's
  `id`, or `null` when fewer than 20 rows came back (no more pages). No
  friends yet → `{ events: [], nextCursor: null }`, not an error.

## UI

- **`/activity`** (new top-level page, client component, same shape as
  `/friends`): fetches the first page on mount, renders an
  `ActivityFeedItem` per event via a new `components/ActivityFeedItem.tsx`:
  friend's avatar + name (linking to `/friends/[userId]`), verb text
  ("finished", "started reading", "rated ★★★★☆" — reusing whatever star
  display `BookCard`/book detail already use for ratings), book cover
  thumbnail + title (linking to `/books/[id]`), relative timestamp (e.g.
  "2h ago" — a small `formatRelativeTime` helper alongside the existing
  `lib/` date-ish utilities, or a light inline implementation if none
  exists).
  - Empty state: "No activity yet — once your friends start, finish, or
    rate books, you'll see it here." (mirrors the bookshelf's empty-state
    tone).
  - "Load more" button at the bottom while `nextCursor` is non-null;
    disabled/hidden once it's `null`.
- **Header** (`AppHeader.tsx`): a new `IconButton` (e.g. `History` icon from
  `@mui/icons-material`) next to the existing Friends `IconButton`, linking
  to `/activity`. No badge/count — unlike friend requests, there's no
  "pending action" concept for activity to badge.

## Error Handling

- Unauthenticated → 401 from the API, redirect to `/login` client-side —
  same pattern every other page in this app already follows
  (`router.push("/login")` on a 401 response).
- Fetch failure → inline error `Typography`, matching `/friends` and
  `/bookshelf`'s existing `error` state pattern.
- No friends yet → not an error; empty state as described above.

## Testing

- `lib/activity/recordActivityEvents.ts` gets unit tests under
  `tests/lib/activity/recordActivityEvents.test.ts` covering: fresh
  `READING`, fresh `READ`, `READ` with a simultaneous rating (both events),
  re-rating an already-`READ` book (only `RATED`), a no-op update (e.g.
  editing `notes` only — no events), and going `READING` → `READING` (no
  duplicate `STARTED_READING`). Matches the existing pattern for pure logic
  (`bookEditDiff.ts`, `compareStats.ts`).
- The `GET /api/activity` route and the two write paths' event emission stay
  manual verification during implementation — consistent with existing
  practice (no route-level test suite exists for any API route in this
  codebase; see the Friends spec's Testing section).
