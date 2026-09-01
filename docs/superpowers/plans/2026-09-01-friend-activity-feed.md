# Friend Activity Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/activity` page showing a reverse-chronological feed of friends' reading activity — started reading, finished, rated — with pagination.

**Architecture:** A new `ActivityEvent` model (append-only, one row per action) is populated by a pure diff helper (`recordActivityEvents`/`activityEventsFor`) wired into the one route that already mutates `UserBook` status/rating. A new `GET /api/activity` route collects the current user's accepted-friend IDs and paginates their events; a new `/activity` page fetches and renders them via a small `ActivityFeedItem` component. Everything else follows this codebase's existing route/page patterns exactly (session check → 401, fetch-in-`useEffect` → loading/error states, `resolveImageUrl` for avatars).

**Tech Stack:** Next.js App Router, Prisma 7 (driver adapters), MUI v9, Vitest.

**Spec:** [docs/superpowers/specs/2026-09-01-friend-activity-feed-design.md](../specs/2026-09-01-friend-activity-feed-design.md)

## Global Constraints

- Every API route: `const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });` — matches every existing route (see `app/api/user-books/route.ts`, `app/api/profile/route.ts`).
- Prisma access via the singleton `prisma` from `@/lib/prisma` — never instantiate `PrismaClient` directly.
- Avatars resolve via `resolveImageUrl(avatarImageId, image, "sm", "profilepictures")` from `@/lib/storage/resolveImageUrl`; book covers via `resolveImageUrl(coverImageId, coverUrl, "sm", "covers")` — same helper, `"covers"` folder, matching `app/bookshelf/page.tsx`.
- Client pages follow the existing fetch-in-`useEffect` pattern: 401 → `router.push("/login")`, other non-ok → an error `Typography`, loading → `<CircularProgress sx={{ m: 4 }} />` while data is `null`. See `app/friends/page.tsx` for the exact shape to match.
- Pure-logic unit tests live under `tests/lib/activity/*.test.ts`, matching `tests/lib/friends/*.test.ts`.
- Migrations: `npx prisma migrate dev --name <name>` (existing migrations live in `prisma/migrations/`, timestamp-prefixed folders — do not hand-edit past migrations).
- No new npm dependencies — everything in this feature (pagination, relative time, rating stars) is built from what's already installed (MUI, Prisma).

---

### Task 1: ActivityEvent schema + migration

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `ActivityEvent` model (`id`, `userId`, `bookId`, `type: ActivityEventType`, `rating`, `createdAt`), `ActivityEventType` enum (`STARTED_READING`, `FINISHED`, `RATED`), `User.activityEvents` and `Book.activityEvents` relations — every later task's Prisma calls depend on these exact names.

- [ ] **Step 1: Add the relation to `User`**

In `prisma/schema.prisma`, add one line to the `User` model's relations block (after `bookEdits BookEdit[]`):

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String?
  name          String?
  image         String?
  avatarImageId String?
  emailVerified DateTime?
  createdAt     DateTime  @default(now())

  accounts  Account[]
  sessions  Session[]
  userBooks UserBook[]
  bookEdits BookEdit[]
  activityEvents ActivityEvent[]

  sentFriendRequests     Friendship[] @relation("FriendshipRequester")
  receivedFriendRequests Friendship[] @relation("FriendshipAddressee")
}
```

- [ ] **Step 2: Add the relation to `Book`**

In `prisma/schema.prisma`, add one line to the `Book` model's relations block (after `tagLinks BookTag[]`):

```prisma
model Book {
  id            String     @id @default(cuid())
  isbn          String     @unique
  title         String
  authors       String[]
  coverUrl      String?
  coverImageId  String?
  description   String?
  genres        String[]
  tags          String[]   @default([])
  pageCount     Int?
  publishedYear Int?
  source        BookSource
  rawResponse   Json?
  fetchedAt     DateTime   @default(now())
  backfillAt    DateTime?

  userBooks  UserBook[]
  edits      BookEdit[]
  genreLinks BookGenre[]
  tagLinks   BookTag[]
  activityEvents ActivityEvent[]
}
```

- [ ] **Step 3: Add the `ActivityEvent` model and `ActivityEventType` enum**

Add this at the end of `prisma/schema.prisma`:

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

- [ ] **Step 4: Generate and run the migration**

Run: `npx prisma migrate dev --name add_activity_events`
Expected: a new `prisma/migrations/<timestamp>_add_activity_events/migration.sql` is created and applied against the dev database without error; `npx prisma generate` runs automatically as part of `migrate dev`.

- [ ] **Step 5: Verify the client types**

Run: `npx tsc --noEmit`
Expected: no errors (confirms `@prisma/client`'s generated types now include `ActivityEvent`/`ActivityEventType`).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add ActivityEvent model and migration"
```

---

### Task 2: `activityEventsFor` diff helper

**Files:**
- Create: `lib/activity/recordActivityEvents.ts`
- Test: `tests/lib/activity/recordActivityEvents.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure, no Prisma import).
- Produces: `activityEventsFor(prev, next)` — used by Task 3's route handlers.

```ts
export type ActivityEventType = "STARTED_READING" | "FINISHED" | "RATED";

export interface ActivityEventDraft {
  type: ActivityEventType;
  rating?: number;
}

export function activityEventsFor(
  prev: { status: "WANT_TO_READ" | "READING" | "READ" | null; rating: number | null },
  next: { status: "WANT_TO_READ" | "READING" | "READ"; rating: number | null }
): ActivityEventDraft[]
```

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/activity/recordActivityEvents.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { activityEventsFor } from "@/lib/activity/recordActivityEvents";

describe("activityEventsFor", () => {
  it("emits STARTED_READING when status moves into READING", () => {
    const events = activityEventsFor(
      { status: "WANT_TO_READ", rating: null },
      { status: "READING", rating: null }
    );
    expect(events).toEqual([{ type: "STARTED_READING" }]);
  });

  it("emits FINISHED when status moves into READ", () => {
    const events = activityEventsFor(
      { status: "READING", rating: null },
      { status: "READ", rating: null }
    );
    expect(events).toEqual([{ type: "FINISHED" }]);
  });

  it("emits both FINISHED and RATED when a book is marked read with a rating in one update", () => {
    const events = activityEventsFor(
      { status: "READING", rating: null },
      { status: "READ", rating: 5 }
    );
    expect(events).toEqual([{ type: "FINISHED" }, { type: "RATED", rating: 5 }]);
  });

  it("emits only RATED when re-rating an already-READ book", () => {
    const events = activityEventsFor(
      { status: "READ", rating: 3 },
      { status: "READ", rating: 4 }
    );
    expect(events).toEqual([{ type: "RATED", rating: 4 }]);
  });

  it("emits nothing for a no-op update (e.g. editing notes only)", () => {
    const events = activityEventsFor(
      { status: "READ", rating: 4 },
      { status: "READ", rating: 4 }
    );
    expect(events).toEqual([]);
  });

  it("does not re-emit STARTED_READING when status stays READING", () => {
    const events = activityEventsFor(
      { status: "READING", rating: null },
      { status: "READING", rating: null }
    );
    expect(events).toEqual([]);
  });

  it("treats a null prev (brand new UserBook) as no prior status", () => {
    const events = activityEventsFor(
      { status: null, rating: null },
      { status: "READING", rating: null }
    );
    expect(events).toEqual([{ type: "STARTED_READING" }]);
  });

  it("does not emit RATED when rating is cleared back to null", () => {
    const events = activityEventsFor(
      { status: "READ", rating: 4 },
      { status: "READ", rating: null }
    );
    expect(events).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/activity/recordActivityEvents.test.ts`
Expected: FAIL — `Cannot find module '@/lib/activity/recordActivityEvents'`.

- [ ] **Step 3: Write the implementation**

Create `lib/activity/recordActivityEvents.ts`:

```ts
export type ActivityEventType = "STARTED_READING" | "FINISHED" | "RATED";

export interface ActivityEventDraft {
  type: ActivityEventType;
  rating?: number;
}

interface UserBookState {
  status: "WANT_TO_READ" | "READING" | "READ" | null;
  rating: number | null;
}

interface NextUserBookState {
  status: "WANT_TO_READ" | "READING" | "READ";
  rating: number | null;
}

/** Diffs a UserBook's previous and next status/rating to decide which
 * activity events a mutation should record. Pure — callers persist the
 * returned drafts as ActivityEvent rows; this function never touches the
 * database. A single mutation can produce more than one event (e.g.
 * marking a book read with a rating in the same request). */
export function activityEventsFor(prev: UserBookState, next: NextUserBookState): ActivityEventDraft[] {
  const events: ActivityEventDraft[] = [];

  if (next.status === "READING" && prev.status !== "READING") {
    events.push({ type: "STARTED_READING" });
  }
  if (next.status === "READ" && prev.status !== "READ") {
    events.push({ type: "FINISHED" });
  }
  if (next.rating != null && next.rating !== prev.rating) {
    events.push({ type: "RATED", rating: next.rating });
  }

  return events;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/activity/recordActivityEvents.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/activity/recordActivityEvents.ts tests/lib/activity/recordActivityEvents.test.ts
git commit -m "feat: add activityEventsFor diff helper"
```

---

### Task 3: Wire event creation into the UserBook mutation routes

**Files:**
- Modify: `app/api/user-books/[id]/route.ts`
- Modify: `app/api/user-books/route.ts`

**Interfaces:**
- Consumes: `activityEventsFor` from Task 2 (`@/lib/activity/recordActivityEvents`).
- Produces: `ActivityEvent` rows in the database whenever a `UserBook` transitions into `READING`/`READ` or gets a new rating — consumed by Task 4's `GET /api/activity`.

- [ ] **Step 1: Wire `PATCH /api/user-books/[id]`**

In `app/api/user-books/[id]/route.ts`, import the helper and use it right before the existing `prisma.userBook.update` call. Replace:

```ts
  const updated = await prisma.userBook.update({
    where: { id },
    data: {
      ...(status !== undefined && { status }),
      ...(rating !== undefined && { rating }),
      ...(notes !== undefined && { notes }),
      ...(startedAt !== undefined && { startedAt: startedAt ? new Date(startedAt) : null }),
      ...(finishedAt !== undefined && { finishedAt: finishedAt ? new Date(finishedAt) : null }),
    },
    include: { book: { include: BOOK_TAXONOMY_INCLUDE } },
  });

  return NextResponse.json({ ...updated, book: serializeBookTaxonomy(updated.book) });
```

with:

```ts
  const nextStatus = status ?? existing.status;
  const nextRating = rating !== undefined ? rating : existing.rating;
  const events = activityEventsFor(
    { status: existing.status, rating: existing.rating },
    { status: nextStatus, rating: nextRating }
  );

  const [updated] = await prisma.$transaction([
    prisma.userBook.update({
      where: { id },
      data: {
        ...(status !== undefined && { status }),
        ...(rating !== undefined && { rating }),
        ...(notes !== undefined && { notes }),
        ...(startedAt !== undefined && { startedAt: startedAt ? new Date(startedAt) : null }),
        ...(finishedAt !== undefined && { finishedAt: finishedAt ? new Date(finishedAt) : null }),
      },
      include: { book: { include: BOOK_TAXONOMY_INCLUDE } },
    }),
    ...(events.length > 0
      ? [
          prisma.activityEvent.createMany({
            data: events.map((event) => ({
              userId: session.user.id,
              bookId: existing.bookId,
              type: event.type,
              rating: event.rating,
            })),
          }),
        ]
      : []),
  ]);

  return NextResponse.json({ ...updated, book: serializeBookTaxonomy(updated.book) });
```

Add the import at the top of the file:

```ts
import { activityEventsFor } from "@/lib/activity/recordActivityEvents";
```

- [ ] **Step 2: Wire `POST /api/user-books`**

In `app/api/user-books/route.ts`, replace the create call:

```ts
  const userBook = await prisma.userBook.create({
    data: { userId: session.user.id, bookId, status },
    include: { book: { include: BOOK_TAXONOMY_INCLUDE } },
  });

  return NextResponse.json({ ...userBook, book: serializeBookTaxonomy(userBook.book) }, { status: 201 });
```

with:

```ts
  const events = activityEventsFor({ status: null, rating: null }, { status, rating: null });

  const [userBook] = await prisma.$transaction([
    prisma.userBook.create({
      data: { userId: session.user.id, bookId, status },
      include: { book: { include: BOOK_TAXONOMY_INCLUDE } },
    }),
    ...(events.length > 0
      ? [
          prisma.activityEvent.createMany({
            data: events.map((event) => ({
              userId: session.user.id,
              bookId,
              type: event.type,
              rating: event.rating,
            })),
          }),
        ]
      : []),
  ]);

  return NextResponse.json({ ...userBook, book: serializeBookTaxonomy(userBook.book) }, { status: 201 });
```

Add the same import at the top of the file:

```ts
import { activityEventsFor } from "@/lib/activity/recordActivityEvents";
```

(Every current caller of this route passes `status: "WANT_TO_READ"`, so `events` is always `[]` here today — this wiring just keeps the route correct if a future caller ever creates directly into `READING`/`READ`.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manually verify**

Run the dev server (`npm run dev`), sign in, mark a book on your shelf as "Reading", then "Read" with a rating. In a Prisma Studio session (`npx prisma studio`) or a quick `psql`/DB client, confirm `ActivityEvent` rows were created: one `STARTED_READING`, then one `FINISHED` and one `RATED` from the second update.

- [ ] **Step 5: Commit**

```bash
git add app/api/user-books
git commit -m "feat: record activity events on UserBook status/rating changes"
```

---

### Task 4: `GET /api/activity`

**Files:**
- Create: `app/api/activity/route.ts`

**Interfaces:**
- Consumes: `prisma` singleton, `auth()`, `resolveImageUrl` is NOT used here (serialization stays server-side plain fields; the client resolves image URLs, matching how `app/api/user-books/route.ts` returns raw `coverUrl`/`coverImageId` for the client to resolve).
- Produces: `GET /api/activity?before=<eventId>` → `{ events: ActivityEventResponse[], nextCursor: string | null }` where each `ActivityEventResponse` is `{ id, type, rating, createdAt, user: { id, name, image, avatarImageId }, book: { id, title, authors, coverUrl, coverImageId } }` — consumed by Task 6's `/activity` page.

- [ ] **Step 1: Write the route**

Create `app/api/activity/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const PAGE_SIZE = 20;

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const friendships = await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    select: { requesterId: true, addresseeId: true },
  });
  const friendIds = friendships.map((f) => (f.requesterId === userId ? f.addresseeId : f.requesterId));

  if (friendIds.length === 0) {
    return NextResponse.json({ events: [], nextCursor: null });
  }

  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before");
  const cursorEvent = before ? await prisma.activityEvent.findUnique({ where: { id: before } }) : null;

  const events = await prisma.activityEvent.findMany({
    where: {
      userId: { in: friendIds },
      ...(cursorEvent && { createdAt: { lt: cursorEvent.createdAt } }),
    },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    include: {
      user: { select: { id: true, name: true, image: true, avatarImageId: true } },
      book: { select: { id: true, title: true, authors: true, coverUrl: true, coverImageId: true } },
    },
  });

  return NextResponse.json({
    events,
    nextCursor: events.length === PAGE_SIZE ? events[events.length - 1].id : null,
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify**

With the dev server running and signed in as a user with at least one accepted friend who has activity, `curl` (or visit in-browser while signed in via cookies, or use the browser's fetch console) `/api/activity` and confirm it returns `{ events: [...], nextCursor }` with friends' events only, newest first. Confirm a user with zero friends gets `{ events: [], nextCursor: null }` instead of an error. Confirm passing `?before=<lastEventId>` returns the next page (or `{ events: [], nextCursor: null }` once exhausted).

- [ ] **Step 4: Commit**

```bash
git add app/api/activity
git commit -m "feat: add GET /api/activity route"
```

---

### Task 5: `formatRelativeTime` helper

**Files:**
- Create: `lib/activity/formatRelativeTime.ts`
- Test: `tests/lib/activity/formatRelativeTime.test.ts`

**Interfaces:**
- Produces: `formatRelativeTime(isoString: string, now?: Date): string` — consumed by Task 6's `ActivityFeedItem`.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/activity/formatRelativeTime.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "@/lib/activity/formatRelativeTime";

const NOW = new Date("2026-09-01T12:00:00.000Z");

describe("formatRelativeTime", () => {
  it("shows seconds for under a minute", () => {
    expect(formatRelativeTime(new Date("2026-09-01T11:59:45.000Z").toISOString(), NOW)).toBe("just now");
  });

  it("shows minutes for under an hour", () => {
    expect(formatRelativeTime(new Date("2026-09-01T11:45:00.000Z").toISOString(), NOW)).toBe("15m ago");
  });

  it("shows hours for under a day", () => {
    expect(formatRelativeTime(new Date("2026-09-01T09:00:00.000Z").toISOString(), NOW)).toBe("3h ago");
  });

  it("shows days for under a week", () => {
    expect(formatRelativeTime(new Date("2026-08-30T12:00:00.000Z").toISOString(), NOW)).toBe("2d ago");
  });

  it("falls back to a plain date beyond a week", () => {
    expect(formatRelativeTime(new Date("2026-08-01T12:00:00.000Z").toISOString(), NOW)).toBe(
      new Date("2026-08-01T12:00:00.000Z").toLocaleDateString(undefined, { month: "short", day: "numeric" })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/activity/formatRelativeTime.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `lib/activity/formatRelativeTime.ts`:

```ts
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Formats an ISO timestamp as a short relative string ("just now", "15m
 * ago", "3h ago", "2d ago"), falling back to a plain "Mon D" date once
 * it's more than a week old — same shape feed timestamps use everywhere.
 * `now` is injectable for tests; defaults to the real current time. */
export function formatRelativeTime(isoString: string, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(isoString).getTime();

  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d ago`;

  return new Date(isoString).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/activity/formatRelativeTime.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/activity/formatRelativeTime.ts tests/lib/activity/formatRelativeTime.test.ts
git commit -m "feat: add formatRelativeTime helper"
```

---

### Task 6: `ActivityFeedItem` component

**Files:**
- Create: `components/ActivityFeedItem.tsx`

**Interfaces:**
- Consumes: `formatRelativeTime` from Task 5, `resolveImageUrl` from `@/lib/storage/resolveImageUrl`.
- Produces: `ActivityFeedItem` component, `type ActivityFeedEvent` — consumed by Task 7's `/activity` page.

```ts
export interface ActivityFeedEvent {
  id: string;
  type: "STARTED_READING" | "FINISHED" | "RATED";
  rating: number | null;
  createdAt: string;
  user: { id: string; name: string | null; image: string | null; avatarImageId: string | null };
  book: { id: string; title: string; authors: string[]; coverUrl: string | null; coverImageId: string | null };
}

export default function ActivityFeedItem({ event }: { event: ActivityFeedEvent }): JSX.Element
```

- [ ] **Step 1: Write the component**

Create `components/ActivityFeedItem.tsx`:

```tsx
"use client";

import { Avatar, Box, Rating, Typography } from "@mui/material";
import Link from "next/link";
import { resolveImageUrl } from "@/lib/storage/resolveImageUrl";
import { formatRelativeTime } from "@/lib/activity/formatRelativeTime";

export interface ActivityFeedEvent {
  id: string;
  type: "STARTED_READING" | "FINISHED" | "RATED";
  rating: number | null;
  createdAt: string;
  user: { id: string; name: string | null; image: string | null; avatarImageId: string | null };
  book: { id: string; title: string; authors: string[]; coverUrl: string | null; coverImageId: string | null };
}

const VERB: Record<ActivityFeedEvent["type"], string> = {
  STARTED_READING: "started reading",
  FINISHED: "finished",
  RATED: "rated",
};

export default function ActivityFeedItem({ event }: { event: ActivityFeedEvent }) {
  const userName = event.user.name ?? "Someone";
  const avatarUrl = resolveImageUrl(event.user.avatarImageId, event.user.image, "sm", "profilepictures");
  const coverUrl = resolveImageUrl(event.book.coverImageId, event.book.coverUrl, "sm", "covers");

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, py: 1.5 }}>
      <Avatar component={Link} href={`/friends/${event.user.id}`} src={avatarUrl ?? undefined} sx={{ width: 40, height: 40 }}>
        {userName.charAt(0).toUpperCase()}
      </Avatar>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2">
          <Typography component={Link} href={`/friends/${event.user.id}`} sx={{ fontWeight: 600, color: "inherit", textDecoration: "none" }}>
            {userName}
          </Typography>{" "}
          {VERB[event.type]}{" "}
          <Typography component={Link} href={`/books/${event.book.id}`} sx={{ fontWeight: 600, color: "inherit", textDecoration: "none" }}>
            {event.book.title}
          </Typography>
        </Typography>
        {event.type === "RATED" && event.rating != null && <Rating value={event.rating} readOnly size="small" />}
        <Typography variant="caption" color="text.secondary">
          {formatRelativeTime(event.createdAt)}
        </Typography>
      </Box>

      {coverUrl && (
        <Box component={Link} href={`/books/${event.book.id}`} sx={{ flexShrink: 0 }}>
          <Box component="img" src={coverUrl} alt={event.book.title} sx={{ width: 40, height: 56, objectFit: "cover", borderRadius: 1 }} />
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ActivityFeedItem.tsx
git commit -m "feat: add ActivityFeedItem component"
```

---

### Task 7: `/activity` page

**Files:**
- Create: `app/activity/page.tsx`

**Interfaces:**
- Consumes: `ActivityFeedItem`/`ActivityFeedEvent` from Task 6, `GET /api/activity` from Task 4.

- [ ] **Step 1: Write the page**

Create `app/activity/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, CircularProgress, Divider, Typography } from "@mui/material";
import ActivityFeedItem, { type ActivityFeedEvent } from "@/components/ActivityFeedItem";

interface ActivityResponse {
  events: ActivityFeedEvent[];
  nextCursor: string | null;
}

export default function ActivityPage() {
  const router = useRouter();
  const [events, setEvents] = useState<ActivityFeedEvent[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (before: string | null) => {
      const url = before ? `/api/activity?before=${before}` : "/api/activity";
      const response = await fetch(url);
      if (response.status === 401) {
        router.push("/login");
        return null;
      }
      if (!response.ok) {
        throw new Error("Failed to load activity");
      }
      return (await response.json()) as ActivityResponse;
    },
    [router]
  );

  useEffect(() => {
    loadPage(null)
      .then((data) => {
        if (!data) return;
        setEvents(data.events);
        setNextCursor(data.nextCursor);
      })
      .catch(() => setError("Could not load your friends' activity. Please try again later."));
  }, [loadPage]);

  async function handleLoadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const data = await loadPage(nextCursor);
      if (!data) return;
      setEvents((prev) => [...(prev ?? []), ...data.events]);
      setNextCursor(data.nextCursor);
    } catch {
      setError("Could not load more activity. Please try again later.");
    } finally {
      setLoadingMore(false);
    }
  }

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  if (!events) return <CircularProgress sx={{ m: 4 }} />;

  return (
    <Box sx={{ maxWidth: 640, mx: "auto", p: { xs: 2, md: 4 } }}>
      <Typography variant="h5" gutterBottom>
        Activity
      </Typography>

      {events.length === 0 ? (
        <Typography color="text.secondary" sx={{ mt: 4, textAlign: "center" }}>
          No activity yet — once your friends start, finish, or rate books, you&apos;ll see it here.
        </Typography>
      ) : (
        <>
          {events.map((event, index) => (
            <Box key={event.id}>
              <ActivityFeedItem event={event} />
              {index < events.length - 1 && <Divider />}
            </Box>
          ))}
          {nextCursor && (
            <Box sx={{ textAlign: "center", mt: 2 }}>
              <Button variant="outlined" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify**

Visit `/activity` while signed in. Confirm: the empty state shows with no friend activity; after a friend (in a second test account) starts/finishes/rates a book, it shows up here; "Load more" appears only when there are more than 20 events and fetches the next page without duplicating rows; a signed-out visit redirects to `/login`.

- [ ] **Step 4: Commit**

```bash
git add app/activity
git commit -m "feat: add /activity page"
```

---

### Task 8: Header nav link

**Files:**
- Modify: `components/AppHeader.tsx`

- [ ] **Step 1: Add the icon import**

In `components/AppHeader.tsx`, change:

```ts
import { Brightness4, Brightness7, QrCodeScanner, People } from "@mui/icons-material";
```

to:

```ts
import { Brightness4, Brightness7, QrCodeScanner, People, History } from "@mui/icons-material";
```

- [ ] **Step 2: Add the nav button**

In `components/AppHeader.tsx`, right after the existing Friends `IconButton` block:

```tsx
          {session?.user && (
            <IconButton component={Link} href="/friends" color="inherit" aria-label="friends">
              <Badge badgeContent={incomingRequestCount} color="error" invisible={incomingRequestCount === 0}>
                <People />
              </Badge>
            </IconButton>
          )}
```

add:

```tsx
          {session?.user && (
            <IconButton component={Link} href="/activity" color="inherit" aria-label="activity">
              <History />
            </IconButton>
          )}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manually verify**

Confirm the new icon appears in the header next to the friends icon while signed in, and links to `/activity`.

- [ ] **Step 5: Commit**

```bash
git add components/AppHeader.tsx
git commit -m "feat: link to /activity from the header"
```

---

### Task 9: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all tests pass, including the new `tests/lib/activity/*.test.ts` files.

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: End-to-end manual walkthrough**

With two signed-in accounts that are friends: on account A, add a book, mark it Reading, then Read with a 4-star rating. On account B, visit `/activity` and confirm three entries appear (started reading, finished, rated ★★★★☆), newest first, each linking correctly to account A's friend profile and the book's detail page.
