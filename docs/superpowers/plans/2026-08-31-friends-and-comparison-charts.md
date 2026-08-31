# Friends & Comparison Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mutual friends (search, request, accept/decline, cancel, unfriend), a friend's read-only bookshelf, and genre/author comparison charts between the current user and one friend.

**Architecture:** A new `Friendship` model (one row per ordered user pair, symmetric lookups) backs a small set of REST-ish routes under `/api/friendships`, `/api/users/search`, and `/api/friends/[userId]/*`. Two new pure functions (`symmetricPairWhere`, `computeCompareStats`) carry the only logic worth unit-testing; everything else follows this codebase's existing route/page patterns exactly (session check → 401, fetch-in-`useEffect` → loading/error states, `resolveImageUrl` for avatars).

**Tech Stack:** Next.js App Router, Prisma 7 (driver adapters), MUI v9, `@mui/x-charts` (new dependency), Vitest.

**Spec:** [docs/superpowers/specs/2026-08-31-friends-and-comparison-charts-design.md](../specs/2026-08-31-friends-and-comparison-charts-design.md)

## Global Constraints

- Every API route: `const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });` — matches every existing route (see `app/api/user-books/route.ts`, `app/api/profile/route.ts`).
- Prisma access via the singleton `prisma` from `@/lib/prisma` — never instantiate `PrismaClient` directly.
- Avatars resolve via `resolveImageUrl(avatarImageId, image, "sm", "profilepictures")` from `@/lib/storage/resolveImageUrl` — size `"sm"` for list/row avatars, matching `AppHeader.tsx` and `app/bookshelf/page.tsx`.
- Friend-scoped routes (`/api/friends/[userId]/books`, `/api/friends/[userId]/compare`) return **403** for both "not friends" and "target user doesn't exist" — never leak which one, since these are reachable by any signed-in user typing an arbitrary ID in the URL.
- `@mui/x-charts` pinned to `9.12.0` (matches the installed `@mui/material@^9.4.0` / `@mui/icons-material@^9.4.0` major and React 19).
- Client pages follow the existing fetch-in-`useEffect` pattern: 401 → `router.push("/login")`, other non-ok → an error `Typography`, loading → `<CircularProgress sx={{ m: 4 }} />` while data is `null`. See `app/bookshelf/page.tsx` / `app/books/[id]/page.tsx` for the exact shape to match.
- Pure-logic unit tests live under `tests/lib/friends/*.test.ts`, matching `tests/lib/books/*.test.ts`.
- Migrations: `npx prisma migrate dev --name <name>` (existing migrations live in `prisma/migrations/`, timestamp-prefixed folders — do not hand-edit past migrations).

---

### Task 1: Friendship schema + migration

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `Friendship` model (`id`, `requesterId`, `addresseeId`, `status: FriendshipStatus`, `createdAt`, `respondedAt`), `FriendshipStatus` enum (`PENDING`, `ACCEPTED`, `DECLINED`), and `User.sentFriendRequests` / `User.receivedFriendRequests` relations — every later task's Prisma calls depend on these exact names.

- [ ] **Step 1: Add the relations to `User`**

In `prisma/schema.prisma`, add two lines to the `User` model's relations block (after `bookEdits BookEdit[]`):

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

  sentFriendRequests     Friendship[] @relation("FriendshipRequester")
  receivedFriendRequests Friendship[] @relation("FriendshipAddressee")
}
```

- [ ] **Step 2: Add the `Friendship` model and `FriendshipStatus` enum**

Add this at the end of `prisma/schema.prisma` (after the `UserBook` model):

```prisma
enum FriendshipStatus {
  PENDING
  ACCEPTED
  DECLINED
}

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
```

- [ ] **Step 3: Generate and run the migration**

Run: `npx prisma migrate dev --name add_friendships`
Expected: a new `prisma/migrations/<timestamp>_add_friendships/migration.sql` is created and applied against the dev database without error; `npx prisma generate` runs automatically as part of `migrate dev`.

- [ ] **Step 4: Verify the client types**

Run: `npx tsc --noEmit`
Expected: no errors (confirms `@prisma/client`'s generated types now include `Friendship`/`FriendshipStatus`).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add Friendship model and migration"
```

---

### Task 2: `symmetricPairWhere` pure helper + tests

**Files:**
- Create: `lib/friends/friendshipWhere.ts`
- Test: `tests/lib/friends/friendshipWhere.test.ts`

**Interfaces:**
- Produces: `symmetricPairWhere(userAId: string, userBId: string): Prisma.FriendshipWhereInput` — consumed by Tasks 4, 7, 8 for every "is there a Friendship row between these two users" query.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/friends/friendshipWhere.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { symmetricPairWhere } from "@/lib/friends/friendshipWhere";

describe("symmetricPairWhere", () => {
  it("matches either direction between two user ids", () => {
    expect(symmetricPairWhere("user-a", "user-b")).toEqual({
      OR: [
        { requesterId: "user-a", addresseeId: "user-b" },
        { requesterId: "user-b", addresseeId: "user-a" },
      ],
    });
  });

  it("is order-independent (same clause regardless of argument order, modulo array order)", () => {
    const ab = symmetricPairWhere("user-a", "user-b");
    const ba = symmetricPairWhere("user-b", "user-a");
    expect(ab.OR).toEqual(expect.arrayContaining(ba.OR!));
    expect(ba.OR).toEqual(expect.arrayContaining(ab.OR!));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/friends/friendshipWhere.test.ts`
Expected: FAIL with a module-not-found error for `@/lib/friends/friendshipWhere`.

- [ ] **Step 3: Write the implementation**

Create `lib/friends/friendshipWhere.ts`:

```typescript
import type { Prisma } from "@prisma/client";

/** Prisma `where` clause matching the Friendship row between two users,
 * regardless of which one is the requester — every "are these two users
 * friends" check in this codebase goes through this helper so the
 * direction-agnostic logic lives in exactly one place. */
export function symmetricPairWhere(userAId: string, userBId: string): Prisma.FriendshipWhereInput {
  return {
    OR: [
      { requesterId: userAId, addresseeId: userBId },
      { requesterId: userBId, addresseeId: userAId },
    ],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/friends/friendshipWhere.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/friends/friendshipWhere.ts tests/lib/friends/friendshipWhere.test.ts
git commit -m "feat: add symmetricPairWhere helper for friendship lookups"
```

---

### Task 3: `computeCompareStats` pure helper + tests

**Files:**
- Create: `lib/friends/compareStats.ts`
- Test: `tests/lib/friends/compareStats.test.ts`

**Interfaces:**
- Consumes: nothing (pure, takes plain `{ genres: string[]; authors: string[] }[]` arrays).
- Produces: `computeCompareStats(yourBooks, friendBooks): CompareStats` where `CompareStats = { genres: CompareRow[]; authors: CompareRow[]; sharedGenres: string[]; sharedAuthors: string[] }` and `CompareRow = { name: string; you: number; friend: number }` — consumed by Task 8's route and Task 12's chart page (the `dataset` prop shape for `@mui/x-charts`' `BarChart` is exactly `CompareRow[]`).

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/friends/compareStats.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computeCompareStats } from "@/lib/friends/compareStats";

describe("computeCompareStats", () => {
  it("counts genre and author frequency for each side independently", () => {
    const stats = computeCompareStats(
      [{ genres: ["Fantasy"], authors: ["Tolkien"] }, { genres: ["Fantasy", "Classic"], authors: ["Camus"] }],
      [{ genres: ["Fantasy"], authors: ["Tolkien"] }]
    );

    expect(stats.genres).toEqual(
      expect.arrayContaining([
        { name: "Fantasy", you: 2, friend: 1 },
        { name: "Classic", you: 1, friend: 0 },
      ])
    );
    expect(stats.authors).toEqual(
      expect.arrayContaining([
        { name: "Tolkien", you: 1, friend: 1 },
        { name: "Camus", you: 1, friend: 0 },
      ])
    );
  });

  it("sorts rows by combined count, highest first", () => {
    const stats = computeCompareStats(
      [{ genres: ["Rare"], authors: [] }, { genres: ["Common"], authors: [] }],
      [{ genres: ["Common"], authors: [] }, { genres: ["Common"], authors: [] }]
    );

    expect(stats.genres.map((row) => row.name)).toEqual(["Common", "Rare"]);
  });

  it("computes shared genres and authors as a plain intersection", () => {
    const stats = computeCompareStats(
      [{ genres: ["Fantasy", "Horror"], authors: ["Tolkien", "King"] }],
      [{ genres: ["Fantasy", "Sci-Fi"], authors: ["Tolkien", "Asimov"] }]
    );

    expect(stats.sharedGenres).toEqual(["Fantasy"]);
    expect(stats.sharedAuthors).toEqual(["Tolkien"]);
  });

  it("returns empty results when both sides have no books", () => {
    const stats = computeCompareStats([], []);
    expect(stats).toEqual({ genres: [], authors: [], sharedGenres: [], sharedAuthors: [] });
  });

  it("handles one side having no books at all", () => {
    const stats = computeCompareStats([{ genres: ["Fantasy"], authors: ["Tolkien"] }], []);
    expect(stats.genres).toEqual([{ name: "Fantasy", you: 1, friend: 0 }]);
    expect(stats.sharedGenres).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/friends/compareStats.test.ts`
Expected: FAIL with a module-not-found error for `@/lib/friends/compareStats`.

- [ ] **Step 3: Write the implementation**

Create `lib/friends/compareStats.ts`:

```typescript
export interface ComparableBook {
  genres: string[];
  authors: string[];
}

export interface CompareRow {
  name: string;
  you: number;
  friend: number;
}

export interface CompareStats {
  genres: CompareRow[];
  authors: CompareRow[];
  sharedGenres: string[];
  sharedAuthors: string[];
}

function frequency(books: ComparableBook[], field: "genres" | "authors"): Map<string, number> {
  const counts = new Map<string, number>();
  for (const book of books) {
    for (const value of book[field]) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return counts;
}

function mergeRows(you: Map<string, number>, friend: Map<string, number>): CompareRow[] {
  const names = new Set([...you.keys(), ...friend.keys()]);
  return [...names]
    .map((name) => ({ name, you: you.get(name) ?? 0, friend: friend.get(name) ?? 0 }))
    .sort((a, b) => b.you + b.friend - (a.you + a.friend));
}

/** Computes genre/author frequency for two users' books, plus which
 * genres/authors they share. Pure — callers are expected to have already
 * filtered each side down to READ books. */
export function computeCompareStats(yourBooks: ComparableBook[], friendBooks: ComparableBook[]): CompareStats {
  const yourGenres = frequency(yourBooks, "genres");
  const friendGenres = frequency(friendBooks, "genres");
  const yourAuthors = frequency(yourBooks, "authors");
  const friendAuthors = frequency(friendBooks, "authors");

  return {
    genres: mergeRows(yourGenres, friendGenres),
    authors: mergeRows(yourAuthors, friendAuthors),
    sharedGenres: [...yourGenres.keys()].filter((name) => friendGenres.has(name)),
    sharedAuthors: [...yourAuthors.keys()].filter((name) => friendAuthors.has(name)),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/friends/compareStats.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/friends/compareStats.ts tests/lib/friends/compareStats.test.ts
git commit -m "feat: add computeCompareStats helper for friend comparison charts"
```

---

### Task 4: `POST` / `GET /api/friendships`

**Files:**
- Create: `app/api/friendships/route.ts`

**Interfaces:**
- Consumes: `symmetricPairWhere` from Task 2.
- Produces: `GET` returns `{ friends: Entry[]; incoming: Entry[]; outgoing: Entry[] }` where `Entry = { friendshipId: string; user: { id, name, email, image, avatarImageId } }` — this exact shape is what Task 9 (header badge), Task 10 (`/friends` page), Task 11, and Task 12 all consume. `POST` accepts `{ addresseeId: string }` and returns the created/revived `Friendship` row with 201, or an error with 400/404/409.

- [ ] **Step 1: Implement the route**

Create `app/api/friendships/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { symmetricPairWhere } from "@/lib/friends/friendshipWhere";

const USER_SELECT = { id: true, name: true, email: true, image: true, avatarImageId: true } as const;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const rows = await prisma.friendship.findMany({
    where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
    include: { requester: { select: USER_SELECT }, addressee: { select: USER_SELECT } },
  });

  const friends: unknown[] = [];
  const incoming: unknown[] = [];
  const outgoing: unknown[] = [];

  for (const row of rows) {
    const isRequester = row.requesterId === userId;
    const other = isRequester ? row.addressee : row.requester;
    const entry = { friendshipId: row.id, user: other };

    if (row.status === "ACCEPTED") {
      friends.push(entry);
    } else if (row.status === "PENDING") {
      (isRequester ? outgoing : incoming).push(entry);
    }
    // DECLINED rows are omitted entirely — not shown in any list.
  }

  return NextResponse.json({ friends, incoming, outgoing });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { addresseeId } = await request.json();
  if (typeof addresseeId !== "string" || !addresseeId) {
    return NextResponse.json({ error: "addresseeId is required" }, { status: 400 });
  }
  if (addresseeId === userId) {
    return NextResponse.json({ error: "You can't send a friend request to yourself" }, { status: 400 });
  }

  const addressee = await prisma.user.findUnique({ where: { id: addresseeId } });
  if (!addressee) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const existing = await prisma.friendship.findFirst({ where: symmetricPairWhere(userId, addresseeId) });

  if (existing) {
    if (existing.status === "ACCEPTED") {
      return NextResponse.json({ error: "Already friends" }, { status: 409 });
    }
    if (existing.status === "PENDING") {
      return NextResponse.json({ error: "A request is already pending" }, { status: 409 });
    }
    // DECLINED — reuse the row rather than creating a new one, which would
    // collide with the unique(requesterId, addresseeId) constraint once the
    // direction flips back.
    const revived = await prisma.friendship.update({
      where: { id: existing.id },
      data: { requesterId: userId, addresseeId, status: "PENDING", respondedAt: null, createdAt: new Date() },
    });
    return NextResponse.json(revived, { status: 201 });
  }

  const created = await prisma.friendship.create({
    data: { requesterId: userId, addresseeId, status: "PENDING" },
  });
  return NextResponse.json(created, { status: 201 });
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint app/api/friendships/route.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/friendships/route.ts
git commit -m "feat: add POST/GET /api/friendships"
```

---

### Task 5: `PATCH` / `DELETE /api/friendships/[id]`

**Files:**
- Create: `app/api/friendships/[id]/route.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PATCH { action: "accept" | "decline" }` → updated `Friendship` row (403 unless caller is the `PENDING` row's addressee). `DELETE` → `{ ok: true }`, cancels a `PENDING` row (403 unless caller is the requester) or removes an `ACCEPTED` row (either party) — consumed by Task 10's `/friends` page.

- [ ] **Step 1: Implement the route**

Create `app/api/friendships/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const { action } = await request.json();
  if (action !== "accept" && action !== "decline") {
    return NextResponse.json({ error: "action must be 'accept' or 'decline'" }, { status: 400 });
  }

  const friendship = await prisma.friendship.findUnique({ where: { id } });
  if (!friendship) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (friendship.addresseeId !== session.user.id || friendship.status !== "PENDING") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const updated = await prisma.friendship.update({
    where: { id },
    data: { status: action === "accept" ? "ACCEPTED" : "DECLINED", respondedAt: new Date() },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const userId = session.user.id;

  const friendship = await prisma.friendship.findUnique({ where: { id } });
  if (!friendship) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isRequester = friendship.requesterId === userId;
  const isAddressee = friendship.addresseeId === userId;
  if (!isRequester && !isAddressee) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  if (friendship.status === "PENDING" && !isRequester) {
    return NextResponse.json({ error: "Only the requester can cancel a pending request" }, { status: 403 });
  }
  if (friendship.status === "DECLINED") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.friendship.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint "app/api/friendships/[id]/route.ts"`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/api/friendships/[id]/route.ts"
git commit -m "feat: add PATCH/DELETE /api/friendships/[id] (accept/decline/cancel/unfriend)"
```

---

### Task 6: `GET /api/users/search`

**Files:**
- Create: `app/api/users/search/route.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `GET ?q=` → `SearchResult[]` where `SearchResult = { id, name, email, image, avatarImageId, relationship: "NONE" | "PENDING_OUTGOING" | "PENDING_INCOMING" | "FRIENDS" }` — consumed by Task 10's `FriendSearch` component.

- [ ] **Step 1: Implement the route**

Create `app/api/users/search/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import type { FriendshipStatus } from "@prisma/client";

type Relationship = "NONE" | "PENDING_OUTGOING" | "PENDING_INCOMING" | "FRIENDS";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json([]);
  }

  const users = await prisma.user.findMany({
    where: {
      id: { not: userId },
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, email: true, image: true, avatarImageId: true },
    take: 20,
  });

  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [
        { requesterId: userId, addresseeId: { in: users.map((u) => u.id) } },
        { addresseeId: userId, requesterId: { in: users.map((u) => u.id) } },
      ],
    },
  });

  function relationshipFor(otherId: string): Relationship {
    const row = friendships.find((f) => f.requesterId === otherId || f.addresseeId === otherId);
    if (!row) return "NONE";
    const status: FriendshipStatus = row.status;
    if (status === "ACCEPTED") return "FRIENDS";
    if (status === "DECLINED") return "NONE"; // a declined request can be re-sent
    return row.requesterId === userId ? "PENDING_OUTGOING" : "PENDING_INCOMING";
  }

  const results = users.map((u) => ({ ...u, relationship: relationshipFor(u.id) }));
  return NextResponse.json(results);
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint app/api/users/search/route.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/users/search/route.ts
git commit -m "feat: add GET /api/users/search with relationship status"
```

---

### Task 7: `GET /api/friends/[userId]/books`

**Files:**
- Create: `app/api/friends/[userId]/books/route.ts`

**Interfaces:**
- Consumes: `symmetricPairWhere` from Task 2.
- Produces: `GET` → the target user's `UserBook[]` (same shape `GET /api/user-books` returns: `{ id, status, rating, notes, startedAt, finishedAt, createdAt, updatedAt, book: Book }`), 403 if not an `ACCEPTED` friend of `userId` (including when `userId` doesn't exist — see Global Constraints) — consumed by Task 11.

- [ ] **Step 1: Implement the route**

Create `app/api/friends/[userId]/books/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { symmetricPairWhere } from "@/lib/friends/friendshipWhere";

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { userId } = await params;

  const friendship = await prisma.friendship.findFirst({
    where: { ...symmetricPairWhere(session.user.id, userId), status: "ACCEPTED" },
  });
  if (!friendship) {
    return NextResponse.json({ error: "Not friends" }, { status: 403 });
  }

  const userBooks = await prisma.userBook.findMany({
    where: { userId },
    include: { book: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(userBooks);
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint "app/api/friends/[userId]/books/route.ts"`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/api/friends/[userId]/books/route.ts"
git commit -m "feat: add GET /api/friends/[userId]/books"
```

---

### Task 8: `GET /api/friends/[userId]/compare`

**Files:**
- Create: `app/api/friends/[userId]/compare/route.ts`

**Interfaces:**
- Consumes: `symmetricPairWhere` (Task 2), `computeCompareStats` (Task 3).
- Produces: `GET` → `CompareStats` (from Task 3), 403 under the same rule as Task 7 — consumed by Task 12.

- [ ] **Step 1: Implement the route**

Create `app/api/friends/[userId]/compare/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { symmetricPairWhere } from "@/lib/friends/friendshipWhere";
import { computeCompareStats } from "@/lib/friends/compareStats";

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { userId } = await params;

  const friendship = await prisma.friendship.findFirst({
    where: { ...symmetricPairWhere(session.user.id, userId), status: "ACCEPTED" },
  });
  if (!friendship) {
    return NextResponse.json({ error: "Not friends" }, { status: 403 });
  }

  const [yourBooks, friendBooks] = await Promise.all([
    prisma.userBook.findMany({ where: { userId: session.user.id, status: "READ" }, include: { book: true } }),
    prisma.userBook.findMany({ where: { userId, status: "READ" }, include: { book: true } }),
  ]);

  const stats = computeCompareStats(
    yourBooks.map((ub) => ({ genres: ub.book.genres, authors: ub.book.authors })),
    friendBooks.map((ub) => ({ genres: ub.book.genres, authors: ub.book.authors }))
  );

  return NextResponse.json(stats);
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint "app/api/friends/[userId]/compare/route.ts"`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/api/friends/[userId]/compare/route.ts"
git commit -m "feat: add GET /api/friends/[userId]/compare"
```

---

### Task 9: Header link + pending-requests badge

**Files:**
- Modify: `components/AppHeader.tsx`

**Interfaces:**
- Consumes: `GET /api/friendships` (Task 4) — reuses its `incoming` array's length.

- [ ] **Step 1: Add the fetch and state**

In `components/AppHeader.tsx`, add a second piece of state and a second effect alongside the existing `avatarImageId` one (same file already has `useEffect`/`useState`/`fetch("/api/profile")` — follow that exact pattern):

```typescript
const [incomingRequestCount, setIncomingRequestCount] = useState(0);

// Same one-fetch-per-sign-in pattern as the avatar effect above.
useEffect(() => {
  if (!session?.user) return;
  fetch("/api/friendships")
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => setIncomingRequestCount(data?.incoming?.length ?? 0))
    .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [session?.user?.email]);
```

- [ ] **Step 2: Add the icon imports**

Add `People` to the existing `@mui/icons-material` import line, and `Badge` to the existing `@mui/material` import line.

- [ ] **Step 3: Add the header icon**

In the JSX, right after the existing scan `IconButton` block (`{session?.user && (<IconButton component={Link} href="/scan" ...)}`), add:

```tsx
{session?.user && (
  <IconButton component={Link} href="/friends" color="inherit" aria-label="friends">
    <Badge badgeContent={incomingRequestCount} color="error" invisible={incomingRequestCount === 0}>
      <People />
    </Badge>
  </IconButton>
)}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx eslint components/AppHeader.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/AppHeader.tsx
git commit -m "feat: add friends header icon with pending-requests badge"
```

---

### Task 10: `/friends` page (search, requests, friends list)

**Files:**
- Create: `components/FriendSearch.tsx`
- Create: `components/FriendRequests.tsx`
- Create: `components/FriendsList.tsx`
- Create: `app/friends/page.tsx`

**Interfaces:**
- Consumes: `GET /api/users/search` (Task 6), `POST /api/friendships` (Task 4), `GET /api/friendships` (Task 4), `PATCH`/`DELETE /api/friendships/[id]` (Task 5).
- Produces: the `/friends` page, linked from Task 9's header icon.

- [ ] **Step 1: `FriendSearch.tsx`**

Create `components/FriendSearch.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  TextField,
  Button,
  List,
  ListItem,
  ListItemAvatar,
  Avatar,
  ListItemText,
  Typography,
  CircularProgress,
} from "@mui/material";
import { resolveImageUrl } from "@/lib/storage/resolveImageUrl";

type Relationship = "NONE" | "PENDING_OUTGOING" | "PENDING_INCOMING" | "FRIENDS";

interface SearchResult {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  avatarImageId: string | null;
  relationship: Relationship;
}

/** Search users by name/email and send friend requests. Calls
 * onRequestSent after a successful send so the parent can refresh its
 * pending-requests lists. */
export default function FriendSearch({ onRequestSent }: { onRequestSent: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setError(null);
    setLoading(true);
    const response = await fetch(`/api/users/search?q=${encodeURIComponent(trimmed)}`);
    setLoading(false);
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (!response.ok) {
      setError("Search failed. Please try again.");
      return;
    }
    setResults(await response.json());
  }

  async function handleAdd(userId: string) {
    setPendingId(userId);
    setError(null);
    const response = await fetch("/api/friendships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresseeId: userId }),
    });
    setPendingId(null);
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Could not send friend request.");
      return;
    }
    setResults((prev) => prev?.map((r) => (r.id === userId ? { ...r, relationship: "PENDING_OUTGOING" } : r)) ?? null);
    onRequestSent();
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box component="form" onSubmit={handleSearch} sx={{ display: "flex", gap: 2 }}>
        <TextField
          label="Search by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          size="small"
          fullWidth
        />
        <Button type="submit" variant="outlined" sx={{ minWidth: 96 }}>
          Search
        </Button>
      </Box>
      {loading && <CircularProgress size={24} />}
      {error && <Typography color="error">{error}</Typography>}
      {results && results.length === 0 && <Typography color="text.secondary">No users found.</Typography>}
      {results && results.length > 0 && (
        <List disablePadding>
          {results.map((r) => (
            <ListItem
              key={r.id}
              secondaryAction={
                r.relationship === "FRIENDS" ? (
                  <Typography variant="body2" color="text.secondary">Friends</Typography>
                ) : r.relationship === "PENDING_OUTGOING" ? (
                  <Typography variant="body2" color="text.secondary">Request sent</Typography>
                ) : r.relationship === "PENDING_INCOMING" ? (
                  <Typography variant="body2" color="text.secondary">Check your requests</Typography>
                ) : (
                  <Button size="small" variant="outlined" disabled={pendingId === r.id} onClick={() => handleAdd(r.id)}>
                    Add friend
                  </Button>
                )
              }
            >
              <ListItemAvatar>
                <Avatar src={resolveImageUrl(r.avatarImageId, r.image, "sm", "profilepictures") ?? undefined}>
                  {(r.name ?? r.email).charAt(0).toUpperCase()}
                </Avatar>
              </ListItemAvatar>
              <ListItemText primary={r.name ?? r.email} secondary={r.name ? r.email : undefined} />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: `FriendRequests.tsx`**

Create `components/FriendRequests.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Box, Typography, List, ListItem, ListItemAvatar, Avatar, ListItemText, Button, Stack } from "@mui/material";
import { resolveImageUrl } from "@/lib/storage/resolveImageUrl";

export interface RequestEntry {
  friendshipId: string;
  user: { id: string; name: string | null; email: string; image: string | null; avatarImageId: string | null };
}

interface FriendRequestsProps {
  incoming: RequestEntry[];
  outgoing: RequestEntry[];
  onRespond: (friendshipId: string, action: "accept" | "decline") => Promise<void>;
  onCancel: (friendshipId: string) => Promise<void>;
}

/** Incoming (Accept/Decline) and outgoing (Cancel) pending friend
 * requests. Renders nothing when there are none of either. */
export default function FriendRequests({ incoming, outgoing, onRespond, onCancel }: FriendRequestsProps) {
  const [busyId, setBusyId] = useState<string | null>(null);

  if (incoming.length === 0 && outgoing.length === 0) return null;

  async function handleRespond(friendshipId: string, action: "accept" | "decline") {
    setBusyId(friendshipId);
    try {
      await onRespond(friendshipId, action);
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(friendshipId: string) {
    setBusyId(friendshipId);
    try {
      await onCancel(friendshipId);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {incoming.length > 0 && (
        <Box>
          <Typography variant="subtitle2" gutterBottom>Requests</Typography>
          <List disablePadding>
            {incoming.map((entry) => (
              <ListItem key={entry.friendshipId} disableGutters>
                <ListItemAvatar>
                  <Avatar src={resolveImageUrl(entry.user.avatarImageId, entry.user.image, "sm", "profilepictures") ?? undefined}>
                    {(entry.user.name ?? entry.user.email).charAt(0).toUpperCase()}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText primary={entry.user.name ?? entry.user.email} />
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={busyId === entry.friendshipId}
                    onClick={() => handleRespond(entry.friendshipId, "accept")}
                  >
                    Accept
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={busyId === entry.friendshipId}
                    onClick={() => handleRespond(entry.friendshipId, "decline")}
                  >
                    Decline
                  </Button>
                </Stack>
              </ListItem>
            ))}
          </List>
        </Box>
      )}
      {outgoing.length > 0 && (
        <Box>
          <Typography variant="subtitle2" gutterBottom>Sent requests</Typography>
          <List disablePadding>
            {outgoing.map((entry) => (
              <ListItem key={entry.friendshipId} disableGutters>
                <ListItemAvatar>
                  <Avatar src={resolveImageUrl(entry.user.avatarImageId, entry.user.image, "sm", "profilepictures") ?? undefined}>
                    {(entry.user.name ?? entry.user.email).charAt(0).toUpperCase()}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText primary={entry.user.name ?? entry.user.email} secondary="Pending" />
                <Button size="small" variant="text" disabled={busyId === entry.friendshipId} onClick={() => handleCancel(entry.friendshipId)}>
                  Cancel
                </Button>
              </ListItem>
            ))}
          </List>
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 3: `FriendsList.tsx`**

Create `components/FriendsList.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Box, Typography, List, ListItemButton, ListItemAvatar, Avatar, ListItemText, Button } from "@mui/material";
import { resolveImageUrl } from "@/lib/storage/resolveImageUrl";
import type { RequestEntry } from "@/components/FriendRequests";

/** Accepted friends list — each row links to that friend's read-only
 * shelf, with an inline Unfriend action. */
export default function FriendsList({
  friends,
  onUnfriend,
}: {
  friends: RequestEntry[];
  onUnfriend: (friendshipId: string) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleUnfriend(friendshipId: string) {
    setBusyId(friendshipId);
    try {
      await onUnfriend(friendshipId);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>Friends</Typography>
      {friends.length === 0 ? (
        <Typography color="text.secondary">No friends yet — search for someone above.</Typography>
      ) : (
        <List disablePadding>
          {friends.map((entry) => (
            <ListItemButton key={entry.friendshipId} component={Link} href={`/friends/${entry.user.id}`} sx={{ borderRadius: 1 }}>
              <ListItemAvatar>
                <Avatar src={resolveImageUrl(entry.user.avatarImageId, entry.user.image, "sm", "profilepictures") ?? undefined}>
                  {(entry.user.name ?? entry.user.email).charAt(0).toUpperCase()}
                </Avatar>
              </ListItemAvatar>
              <ListItemText primary={entry.user.name ?? entry.user.email} />
              <Button
                size="small"
                variant="text"
                color="inherit"
                disabled={busyId === entry.friendshipId}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleUnfriend(entry.friendshipId);
                }}
              >
                Unfriend
              </Button>
            </ListItemButton>
          ))}
        </List>
      )}
    </Box>
  );
}
```

- [ ] **Step 4: `app/friends/page.tsx`**

Create `app/friends/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Typography, CircularProgress, Divider } from "@mui/material";
import FriendSearch from "@/components/FriendSearch";
import FriendRequests, { type RequestEntry } from "@/components/FriendRequests";
import FriendsList from "@/components/FriendsList";

interface FriendshipsResponse {
  friends: RequestEntry[];
  incoming: RequestEntry[];
  outgoing: RequestEntry[];
}

export default function FriendsPage() {
  const router = useRouter();
  const [data, setData] = useState<FriendshipsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/friendships");
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (!response.ok) {
      setError("Could not load your friends. Please try again later.");
      return;
    }
    setData(await response.json());
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function respond(friendshipId: string, action: "accept" | "decline") {
    const response = await fetch(`/api/friendships/${friendshipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (response.ok) await load();
  }

  async function remove(friendshipId: string) {
    const response = await fetch(`/api/friendships/${friendshipId}`, { method: "DELETE" });
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (response.ok) await load();
  }

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  if (!data) return <CircularProgress sx={{ m: 4 }} />;

  return (
    <Box sx={{ maxWidth: 640, mx: "auto", p: { xs: 2, md: 4 } }}>
      <Typography variant="h5" gutterBottom>Friends</Typography>
      <FriendSearch onRequestSent={load} />
      <Divider sx={{ my: 3 }} />
      <FriendRequests incoming={data.incoming} outgoing={data.outgoing} onRespond={respond} onCancel={remove} />
      {(data.incoming.length > 0 || data.outgoing.length > 0) && <Divider sx={{ my: 3 }} />}
      <FriendsList friends={data.friends} onUnfriend={remove} />
    </Box>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npx eslint components/FriendSearch.tsx components/FriendRequests.tsx components/FriendsList.tsx app/friends/page.tsx`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, sign in as two different users (e.g. two browser profiles), search for the other by email from `/friends`, send a request, accept it from the other account, confirm both accounts now show the friend in their list, then unfriend from either side and confirm both lose it.

- [ ] **Step 7: Commit**

```bash
git add components/FriendSearch.tsx components/FriendRequests.tsx components/FriendsList.tsx app/friends/page.tsx
git commit -m "feat: add /friends page (search, requests, friends list)"
```

---

### Task 11: `/friends/[userId]` read-only shelf page

**Files:**
- Create: `app/friends/[userId]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/friends/[userId]/books` (Task 7), `BookCard` (existing, `components/BookCard.tsx`), `resolveImageUrl` (existing).

- [ ] **Step 1: Implement the page**

Create `app/friends/[userId]/page.tsx`:

```tsx
"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Box, Typography, CircularProgress, Tabs, Tab, Button } from "@mui/material";
import BookCard from "@/components/BookCard";
import { resolveImageUrl } from "@/lib/storage/resolveImageUrl";

interface FriendUserBook {
  id: string;
  status: "WANT_TO_READ" | "READING" | "READ";
  rating: number | null;
  book: { id: string; title: string; authors: string[]; coverUrl: string | null; coverImageId: string | null };
}

const TABS: { label: string; status: FriendUserBook["status"] | "ALL" }[] = [
  { label: "All", status: "ALL" },
  { label: "Want to Read", status: "WANT_TO_READ" },
  { label: "Reading", status: "READING" },
  { label: "Read", status: "READ" },
];

export default function FriendShelfPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const router = useRouter();
  const [books, setBooks] = useState<FriendUserBook[] | null>(null);
  const [notFriends, setNotFriends] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    fetch(`/api/friends/${userId}/books`)
      .then((res) => {
        if (res.status === 401) {
          router.push("/login");
          return null;
        }
        if (res.status === 403) {
          setNotFriends(true);
          return null;
        }
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data) => {
        if (data) setBooks(data);
      })
      .catch(() => setError("Could not load this shelf. Please try again later."));
  }, [userId, router]);

  if (notFriends) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="text.secondary">You&apos;re not friends with this user.</Typography>
      </Box>
    );
  }
  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }
  if (!books) return <CircularProgress sx={{ m: 4 }} />;

  const activeStatus = TABS[tab].status;
  const filtered = activeStatus === "ALL" ? books : books.filter((ub) => ub.status === activeStatus);

  return (
    <Box sx={{ p: 4 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3, flexWrap: "wrap", gap: 2 }}>
        <Tabs value={tab} onChange={(_, v: number) => setTab(v)}>
          {TABS.map((t) => (
            <Tab key={t.status} label={t.label} />
          ))}
        </Tabs>
        <Button variant="outlined" component={Link} href={`/friends/${userId}/compare`}>
          Compare
        </Button>
      </Box>
      {filtered.length === 0 ? (
        <Typography color="text.secondary">No books here yet.</Typography>
      ) : (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
          {filtered.map((ub) => (
            <BookCard
              key={ub.id}
              userBook={{ ...ub, book: { ...ub.book, coverUrl: resolveImageUrl(ub.book.coverImageId, ub.book.coverUrl, "sm", "covers") } }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint "app/friends/[userId]/page.tsx"`
Expected: no errors.

- [ ] **Step 3: Manual verification**

With two accepted-friend accounts from Task 10's manual check, visit `/friends/<other user's id>` from one account and confirm their shelf renders read-only (no "Add a book" button, no edit controls); log out and hit the same URL signed in as an unrelated third account (or after unfriending) and confirm the "not friends" message shows instead of the shelf.

- [ ] **Step 4: Commit**

```bash
git add "app/friends/[userId]/page.tsx"
git commit -m "feat: add read-only friend bookshelf page"
```

---

### Task 12: Comparison charts page

**Files:**
- Modify: `package.json`, `package-lock.json` (new dependency)
- Create: `app/friends/[userId]/compare/page.tsx`

**Interfaces:**
- Consumes: `GET /api/friends/[userId]/compare` (Task 8), `BarChart` from `@mui/x-charts`.

- [ ] **Step 1: Install `@mui/x-charts`**

Run: `npm install @mui/x-charts@9.12.0`
Expected: added to `dependencies` in `package.json`; `npx tsc --noEmit` still passes afterward.

- [ ] **Step 2: Implement the page**

Create `app/friends/[userId]/compare/page.tsx`:

```tsx
"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Box, Typography, CircularProgress, Stack, Chip } from "@mui/material";
import { BarChart } from "@mui/x-charts/BarChart";

interface CompareRow {
  name: string;
  you: number;
  friend: number;
}

interface CompareStats {
  genres: CompareRow[];
  authors: CompareRow[];
  sharedGenres: string[];
  sharedAuthors: string[];
}

export default function CompareStatsPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const router = useRouter();
  const [stats, setStats] = useState<CompareStats | null>(null);
  const [notFriends, setNotFriends] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/friends/${userId}/compare`)
      .then((res) => {
        if (res.status === 401) {
          router.push("/login");
          return null;
        }
        if (res.status === 403) {
          setNotFriends(true);
          return null;
        }
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data) => {
        if (data) setStats(data);
      })
      .catch(() => setError("Could not load comparison. Please try again later."));
  }, [userId, router]);

  if (notFriends) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="text.secondary">You&apos;re not friends with this user.</Typography>
      </Box>
    );
  }
  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }
  if (!stats) return <CircularProgress sx={{ m: 4 }} />;

  const overlap = [...stats.sharedGenres, ...stats.sharedAuthors];

  return (
    <Box sx={{ maxWidth: 800, mx: "auto", p: { xs: 2, md: 4 }, display: "flex", flexDirection: "column", gap: 4 }}>
      <Typography variant="h5">Compare</Typography>

      <Box>
        <Typography variant="subtitle1" gutterBottom>Genres</Typography>
        {stats.genres.length === 0 ? (
          <Typography color="text.secondary">Neither of you has any read books with genres yet.</Typography>
        ) : (
          <BarChart
            dataset={stats.genres}
            xAxis={[{ dataKey: "name", scaleType: "band" }]}
            series={[{ dataKey: "you", label: "You" }, { dataKey: "friend", label: "Friend" }]}
            height={300}
          />
        )}
      </Box>

      <Box>
        <Typography variant="subtitle1" gutterBottom>Authors</Typography>
        {stats.authors.length === 0 ? (
          <Typography color="text.secondary">Neither of you has any read books with authors yet.</Typography>
        ) : (
          <BarChart
            dataset={stats.authors}
            xAxis={[{ dataKey: "name", scaleType: "band" }]}
            series={[{ dataKey: "you", label: "You" }, { dataKey: "friend", label: "Friend" }]}
            height={300}
          />
        )}
      </Box>

      <Box>
        <Typography variant="subtitle1" gutterBottom>You both like</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {overlap.length === 0 ? (
            <Typography color="text.secondary">No overlap yet.</Typography>
          ) : (
            overlap.map((label) => <Chip key={label} label={label} size="small" />)
          )}
        </Stack>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint "app/friends/[userId]/compare/page.tsx"`
Expected: no errors. If `BarChart`'s prop types from the installed `@mui/x-charts` version don't match (`dataset`/`xAxis`/`series` shape), adjust to match the installed version's types — check `node_modules/@mui/x-charts/BarChart/BarChart.d.ts` for the exact prop signature rather than guessing.

- [ ] **Step 4: Manual verification**

With two accepted-friend accounts who each have at least one `READ` book with genres/authors, visit `/friends/<other user's id>/compare` and confirm both bar charts render with "You"/"Friend" series and the theme's palette; confirm the overlap chips show for any shared genre/author.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json "app/friends/[userId]/compare/page.tsx"
git commit -m "feat: add friend comparison charts page"
```

---

## Final Check

After Task 12, run the full suite once: `npx tsc --noEmit && npm run lint && npm run test` — all three must be clean before considering this plan done.
