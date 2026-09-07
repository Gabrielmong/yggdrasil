# Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `role` (USER/ADMIN) and `active` flag to `User`, and a `/admin` panel — visible only to admins — for managing users (role, active/deactivated) and the shared book catalog (browse, create directly, delete).

**Architecture:** Two plain columns on `User` (`role`, `active`) back everything. A pure `requireAdmin(session)` guard (mirroring the existing per-route 401 idiom) protects every `/api/admin/*` route. Deactivation blocks login via the existing `authorize()` callbacks and invalidates already-issued JWT sessions by re-checking `active` on every `jwt` callback call; it hides a user from friends by adding an `active: true` check everywhere a friend's-eye view of another user is queried. Book creation reuses the existing `POST /api/books/manual` / `GET /api/books/lookup` routes and their components unchanged — those already create/return a `Book` without touching `UserBook`.

**Tech Stack:** Next.js App Router, NextAuth v5 (beta), Prisma 7 (driver adapters), MUI v9, Vitest.

**Spec:** [docs/superpowers/specs/2026-09-06-admin-panel-design.md](../specs/2026-09-06-admin-panel-design.md)

## Global Constraints

- Every API route: `const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });` — every existing route in this app follows this, and every `/api/admin/*` route additionally requires `session.user.role === "ADMIN"` (403 otherwise) via `requireAdmin()`.
- Prisma access via the singleton `prisma` from `@/lib/prisma` — never instantiate `PrismaClient` directly.
- List-based UI (not tables) — this codebase has no `<Table>` usage anywhere; every existing multi-row list (`FriendsList.tsx`, `FriendRequests.tsx`) uses MUI `List`/`ListItem`/`ListItemAvatar`/`ListItemText`. The admin pages follow the same pattern.
- Client pages follow the existing fetch-in-`useEffect` pattern: 401 → `router.push("/login")`, other non-ok → an error `Typography`, loading → `<CircularProgress sx={{ m: 4 }} />` while data is `null`.
- Avatars resolve via `resolveImageUrl(avatarImageId, image, "sm", "profilepictures")` from `@/lib/storage/resolveImageUrl`.
- Migrations: `npx prisma migrate dev --name <name>` (existing migrations live in `prisma/migrations/`, timestamp-prefixed folders — do not hand-edit past migrations).
- Pure-logic unit tests live under `tests/lib/<area>/*.test.ts`, matching `tests/lib/friends/*.test.ts`.
- No new npm dependencies.

---

### Task 1: Role/active schema + migration

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `Role` enum (`USER`, `ADMIN`), `User.role: Role` (default `USER`), `User.active: Boolean` (default `true`) — every later task depends on these exact names and defaults.

- [ ] **Step 1: Add the `Role` enum**

Add this to `prisma/schema.prisma`, near the other enums (e.g. after `ActivityEventType`):

```prisma
enum Role {
  USER
  ADMIN
}
```

- [ ] **Step 2: Add `role` and `active` to `User`**

In `prisma/schema.prisma`, add two lines to the `User` model (after `createdAt DateTime @default(now())`):

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
  role          Role      @default(USER)
  active        Boolean   @default(true)

  accounts  Account[]
  sessions  Session[]
  userBooks UserBook[]
  bookEdits BookEdit[]
  activityEvents ActivityEvent[]

  sentFriendRequests     Friendship[] @relation("FriendshipRequester")
  receivedFriendRequests Friendship[] @relation("FriendshipAddressee")
}
```

- [ ] **Step 3: Generate and run the migration**

Run: `npx prisma migrate dev --name add_user_role_and_active`
Expected: a new `prisma/migrations/<timestamp>_add_user_role_and_active/migration.sql` is created and applied without error; every existing row gets `role = 'USER'` and `active = true` from the column defaults.

- [ ] **Step 4: Verify the client types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add Role enum and active flag to User"
```

---

### Task 2: Auth wiring — session role, login blocking, session invalidation

**Files:**
- Create: `types/next-auth.d.ts`
- Modify: `lib/auth.ts`

**Interfaces:**
- Consumes: `User.role`, `User.active` from Task 1.
- Produces: `session.user.role: Role` (available both server-side via `auth()` and client-side via `useSession()`) — consumed by Task 3 (`requireAdmin`), Task 7/8 (client-side page guards), Task 9 (header nav).

- [ ] **Step 1: Add the NextAuth type augmentation**

Create `types/next-auth.d.ts`:

```ts
import type { DefaultSession } from "next-auth";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
  }
}
```

- [ ] **Step 2: Block login for deactivated users in both `authorize()` callbacks**

In `lib/auth.ts`, in the `"google-credential"` provider's `authorize`, change:

```ts
        const user = await prisma.user.upsert({
          where: { email: identity.email },
          create: { email: identity.email, name: identity.name, image: identity.picture },
          update: {},
        });

        return { id: user.id, email: user.email, name: user.name, image: user.image };
```

to:

```ts
        const user = await prisma.user.upsert({
          where: { email: identity.email },
          create: { email: identity.email, name: identity.name, image: identity.picture },
          update: {},
        });
        if (!user.active) return null;

        return { id: user.id, email: user.email, name: user.name, image: user.image };
```

In the `"credentials"` provider's `authorize`, change:

```ts
        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name, image: user.image };
```

to:

```ts
        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;
        if (!user.active) return null;

        return { id: user.id, email: user.email, name: user.name, image: user.image };
```

- [ ] **Step 3: Thread `role` through the callbacks and re-check `active` on every request**

In `lib/auth.ts`, replace the `callbacks` block:

```ts
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
```

with:

```ts
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      if (!token.id) return token;

      // Re-checked on every request (JWT sessions are stateless, so a
      // token issued before a deactivation would otherwise stay valid
      // until it expires): a since-deactivated user's token is stripped
      // of its id here, which the session callback below then treats as
      // signed-out — the same effect a 401 already has everywhere else.
      const dbUser = await prisma.user.findUnique({
        where: { id: token.id },
        select: { active: true, role: true },
      });
      if (!dbUser?.active) {
        delete token.id;
        return token;
      }
      token.role = dbUser.role;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id && token.role) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manually verify**

With the dev server running, sign in as an existing user and confirm the app behaves exactly as before (this task adds fields, doesn't change any existing behavior for an `active: true` user). Then, using Prisma Studio (`npx prisma studio`) or a DB client, set that user's `active` to `false` and refresh any page — confirm the app now treats the session as signed out (redirected to `/login` by the existing 401-handling in every page, since `session.user.id` is now unset). Set `active` back to `true` afterward to restore the test account.

- [ ] **Step 6: Commit**

```bash
git add types/next-auth.d.ts lib/auth.ts
git commit -m "feat: thread role through sessions, block login for deactivated users"
```

---

### Task 3: `requireAdmin` guard

**Files:**
- Create: `lib/auth/requireAdmin.ts`
- Test: `tests/lib/auth/requireAdmin.test.ts`

**Interfaces:**
- Consumes: `session.user.role` from Task 2.
- Produces: `requireAdmin(session: Session | null): AdminGuardResult` where
  `AdminGuardResult = { ok: true; userId: string } | { ok: false; response: NextResponse }`
  — used by every task-5/6 admin API route.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/auth/requireAdmin.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import type { Session } from "next-auth";

function sessionWith(role: "USER" | "ADMIN", id = "user-1"): Session {
  return {
    user: { id, role, name: "Test", email: "test@example.com", image: null },
    expires: "2099-01-01T00:00:00.000Z",
  };
}

describe("requireAdmin", () => {
  it("returns a 401 response when there is no session", async () => {
    const result = requireAdmin(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(await result.response.json()).toEqual({ error: "Unauthorized" });
    }
  });

  it("returns a 401 response when the session has no user id", async () => {
    const result = requireAdmin({ user: { role: "ADMIN" }, expires: "2099-01-01T00:00:00.000Z" } as unknown as Session);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("returns a 403 response when the session user is not an admin", async () => {
    const result = requireAdmin(sessionWith("USER"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect(await result.response.json()).toEqual({ error: "Forbidden" });
    }
  });

  it("returns ok with the caller's user id when the session user is an admin", () => {
    const result = requireAdmin(sessionWith("ADMIN", "admin-1"));
    expect(result).toEqual({ ok: true, userId: "admin-1" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/auth/requireAdmin.test.ts`
Expected: FAIL — `Cannot find module '@/lib/auth/requireAdmin'`.

- [ ] **Step 3: Write the implementation**

Create `lib/auth/requireAdmin.ts`:

```ts
import { NextResponse } from "next/server";
import type { Session } from "next-auth";

export type AdminGuardResult = { ok: true; userId: string } | { ok: false; response: NextResponse };

/** Given the current request's already-resolved session, decides whether
 * the caller may proceed to an admin-only route: a 401 response if not
 * signed in, a 403 response if signed in but not an ADMIN, otherwise the
 * caller's own user id (routes that must block an admin from acting on
 * their own account use this). Pure — takes the resolved session instead
 * of calling next-auth's `auth()` itself, so it's unit-testable without
 * a request context. */
export function requireAdmin(session: Session | null): AdminGuardResult {
  if (!session?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.user.role !== "ADMIN") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, userId: session.user.id };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/auth/requireAdmin.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/auth/requireAdmin.ts tests/lib/auth/requireAdmin.test.ts
git commit -m "feat: add requireAdmin guard for admin-only routes"
```

---

### Task 4: Hide deactivated users from friend-facing queries

**Files:**
- Create: `lib/friends/isActiveFriend.ts`
- Modify: `app/api/friends/[userId]/books/route.ts`
- Modify: `app/api/friends/[userId]/profile/route.ts`
- Modify: `app/api/friends/[userId]/stats/route.ts`
- Modify: `app/api/friends/[userId]/compare/route.ts`
- Modify: `app/api/friendships/route.ts`
- Modify: `app/api/activity/route.ts`
- Modify: `app/api/users/search/route.ts`

**Interfaces:**
- Consumes: `User.active` from Task 1.
- Produces: `isActiveFriend(userId: string, otherUserId: string): Promise<boolean>` — used by the four `app/api/friends/[userId]/*` routes.

- [ ] **Step 1: Add the shared helper**

Create `lib/friends/isActiveFriend.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { symmetricPairWhere } from "@/lib/friends/friendshipWhere";

/** True when `userId` and `otherUserId` have an ACCEPTED friendship AND
 * `otherUserId`'s account is still active. Every friend-scoped route
 * (books/profile/stats/compare) uses this single check so a deactivated
 * user disappears from a friend's view uniformly — the underlying
 * Friendship row is never touched, so reactivating the user restores
 * access immediately. */
export async function isActiveFriend(userId: string, otherUserId: string): Promise<boolean> {
  const [friendship, otherUser] = await Promise.all([
    prisma.friendship.findFirst({ where: { ...symmetricPairWhere(userId, otherUserId), status: "ACCEPTED" } }),
    prisma.user.findUnique({ where: { id: otherUserId }, select: { active: true } }),
  ]);
  return Boolean(friendship) && Boolean(otherUser?.active);
}
```

- [ ] **Step 2: Wire it into the four friend-scoped routes**

In each of `app/api/friends/[userId]/books/route.ts`, `app/api/friends/[userId]/profile/route.ts`, `app/api/friends/[userId]/stats/route.ts`, and `app/api/friends/[userId]/compare/route.ts`, replace:

```ts
  const friendship = await prisma.friendship.findFirst({
    where: { ...symmetricPairWhere(session.user.id, userId), status: "ACCEPTED" },
  });
  if (!friendship) {
    return NextResponse.json({ error: "Not friends" }, { status: 403 });
  }
```

with:

```ts
  if (!(await isActiveFriend(session.user.id, userId))) {
    return NextResponse.json({ error: "Not friends" }, { status: 403 });
  }
```

Remove the now-unused `symmetricPairWhere` import from each of these four files (it's no longer called directly there — only `isActiveFriend` is), and add:

```ts
import { isActiveFriend } from "@/lib/friends/isActiveFriend";
```

- [ ] **Step 3: Exclude inactive friends/requests from `GET /api/friendships`**

In `app/api/friendships/route.ts`, change:

```ts
const USER_SELECT = { id: true, name: true, image: true, avatarImageId: true } as const;
```

to:

```ts
const USER_SELECT = { id: true, name: true, image: true, avatarImageId: true, active: true } as const;
```

and change the loop body from:

```ts
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
```

to:

```ts
  for (const row of rows) {
    const isRequester = row.requesterId === userId;
    const other = isRequester ? row.addressee : row.requester;
    if (!other.active) continue; // a deactivated user disappears from every list here

    const entry = { friendshipId: row.id, user: other };

    if (row.status === "ACCEPTED") {
      friends.push(entry);
    } else if (row.status === "PENDING") {
      (isRequester ? outgoing : incoming).push(entry);
    }
    // DECLINED rows are omitted entirely — not shown in any list.
  }
```

- [ ] **Step 4: Exclude inactive friends from the activity feed**

In `app/api/activity/route.ts`, change:

```ts
  const friendships = await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    select: { requesterId: true, addresseeId: true },
  });
```

to:

```ts
  const friendships = await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: userId, addressee: { active: true } },
        { addresseeId: userId, requester: { active: true } },
      ],
    },
    select: { requesterId: true, addresseeId: true },
  });
```

- [ ] **Step 5: Exclude inactive users from search**

In `app/api/users/search/route.ts`, change:

```ts
  const users = await prisma.user.findMany({
    where: {
      id: { not: userId },
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
```

to:

```ts
  const users = await prisma.user.findMany({
    where: {
      id: { not: userId },
      active: true,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manually verify**

Using the two throwaway-account technique from earlier work in this repo (create two users + an accepted friendship via a small script against the real dev DB, clean up afterward): confirm `isActiveFriend` returns `true` for an active accepted friend and `false` once that friend's `active` is set to `false`, and that `GET /api/friendships`/`GET /api/activity`/`GET /api/users/search` all correctly omit an inactive user.

- [ ] **Step 8: Commit**

```bash
git add lib/friends/isActiveFriend.ts app/api/friends app/api/friendships/route.ts app/api/activity/route.ts app/api/users/search/route.ts
git commit -m "feat: hide deactivated users from friend-facing queries"
```

---

### Task 5: Admin users API

**Files:**
- Create: `app/api/admin/users/route.ts`
- Create: `app/api/admin/users/[id]/route.ts`

**Interfaces:**
- Consumes: `requireAdmin` from Task 3.
- Produces: `GET /api/admin/users?q=` → `AdminUser[]`, `PATCH /api/admin/users/[id]` → `AdminUser`, where
  `AdminUser = { id, name, email, image, avatarImageId, createdAt, role, active, _count: { userBooks: number } }`
  — consumed by Task 7's `/admin/users` page.

- [ ] **Step 1: Write `GET /api/admin/users`**

Create `app/api/admin/users/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth/requireAdmin";

const ADMIN_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
  avatarImageId: true,
  createdAt: true,
  role: true,
  active: true,
  _count: { select: { userBooks: true } },
} as const;

export async function GET(request: Request) {
  const guard = requireAdmin(await auth());
  if (!guard.ok) return guard.response;

  const q = new URL(request.url).searchParams.get("q")?.trim();

  const users = await prisma.user.findMany({
    where: q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }
      : undefined,
    select: ADMIN_USER_SELECT,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(users);
}
```

- [ ] **Step 2: Write `PATCH /api/admin/users/[id]`**

Create `app/api/admin/users/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth/requireAdmin";

const ADMIN_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
  avatarImageId: true,
  createdAt: true,
  role: true,
  active: true,
  _count: { select: { userBooks: true } },
} as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAdmin(await auth());
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (id === guard.userId) {
    return NextResponse.json({ error: "You can't change your own account from here" }, { status: 400 });
  }

  const { role, active } = await request.json();
  if (role !== undefined && role !== "USER" && role !== "ADMIN") {
    return NextResponse.json({ error: "role must be USER or ADMIN" }, { status: 400 });
  }
  if (active !== undefined && typeof active !== "boolean") {
    return NextResponse.json({ error: "active must be a boolean" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(role !== undefined && { role }),
      ...(active !== undefined && { active }),
    },
    select: ADMIN_USER_SELECT,
  });

  return NextResponse.json(updated);
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manually verify**

Bootstrap yourself as an admin: with the dev server stopped or in another terminal, run `npx prisma studio`, open the `User` table, and set your own row's `role` to `ADMIN` (this is the one-time direct DB edit from the spec's non-goals — no code does this for you). Then, signed in as that account, confirm `GET /api/admin/users` returns every user with the expected fields, and `PATCH /api/admin/users/[id]` (for a different user's id) can toggle `role`/`active` and returns the updated row; confirm calling it with your own id returns 400; confirm a non-admin account gets 403 from both routes.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/users
git commit -m "feat: add admin users API"
```

---

### Task 6: Admin books API

**Files:**
- Create: `app/api/admin/books/route.ts`
- Create: `app/api/admin/books/[id]/route.ts`

**Interfaces:**
- Consumes: `requireAdmin` from Task 3, `BOOK_TAXONOMY_INCLUDE`/`serializeBookTaxonomy` from `@/lib/books/serializeBook`.
- Produces: `GET /api/admin/books?q=` → serialized `Book[]` (each including `_count.userBooks`), `DELETE /api/admin/books/[id]` → `{ ok: true }` — consumed by Task 8's `/admin/books` page.

- [ ] **Step 1: Write `GET /api/admin/books`**

Create `app/api/admin/books/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { BOOK_TAXONOMY_INCLUDE, serializeBookTaxonomy } from "@/lib/books/serializeBook";

export async function GET(request: Request) {
  const guard = requireAdmin(await auth());
  if (!guard.ok) return guard.response;

  const q = new URL(request.url).searchParams.get("q")?.trim().toLowerCase();

  const books = await prisma.book.findMany({
    include: { ...BOOK_TAXONOMY_INCLUDE, _count: { select: { userBooks: true } } },
    orderBy: { fetchedAt: "desc" },
  });

  const serialized = books.map(serializeBookTaxonomy);

  // authors is a String[]; Prisma can't substring-match inside it, so the
  // author part of the search is filtered here in application code —
  // fine at this app's scale (same tradeoff other full-shelf computations
  // in this codebase already make, e.g. lib/friends/compareStats.ts).
  const filtered = q
    ? serialized.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.isbn.toLowerCase().includes(q) ||
          b.authors.some((a) => a.toLowerCase().includes(q))
      )
    : serialized;

  return NextResponse.json(filtered);
}
```

- [ ] **Step 2: Write `DELETE /api/admin/books/[id]`**

Create `app/api/admin/books/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth/requireAdmin";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAdmin(await auth());
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const existing = await prisma.book.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.book.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manually verify**

As the admin account from Task 5: confirm `GET /api/admin/books` returns every book with `_count.userBooks`, that `?q=` filters by title/ISBN/author (case-insensitive), and that `DELETE /api/admin/books/[id]` removes a book (verify via Prisma Studio that its `UserBook`/`BookEdit`/taxonomy-link rows are gone too, per the schema's existing cascade). Confirm a non-admin account gets 403 from both routes.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/books
git commit -m "feat: add admin books API"
```

---

### Task 7: `/admin/users` page

**Files:**
- Create: `components/admin/AdminUserRow.tsx`
- Create: `app/admin/users/page.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/users`, `PATCH /api/admin/users/[id]` from Task 5.
- Produces: `AdminUserRow` component, `type AdminUser` — the shape `GET /api/admin/users` returns, re-declared client-side (matching how every other page in this app re-declares its own fetched-data interfaces rather than sharing types across the client/server boundary).

- [ ] **Step 1: Write `AdminUserRow`**

Create `components/admin/AdminUserRow.tsx`:

```tsx
"use client";

import { ListItem, ListItemAvatar, Avatar, ListItemText, Stack, ToggleButtonGroup, ToggleButton, Button, Typography } from "@mui/material";
import { resolveImageUrl } from "@/lib/storage/resolveImageUrl";
import { displayName, displayInitial } from "@/lib/displayName";

export interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  avatarImageId: string | null;
  createdAt: string;
  role: "USER" | "ADMIN";
  active: boolean;
  _count: { userBooks: number };
}

export default function AdminUserRow({
  user,
  isSelf,
  busy,
  onChangeRole,
  onToggleActive,
}: {
  user: AdminUser;
  isSelf: boolean;
  busy: boolean;
  onChangeRole: (id: string, role: "USER" | "ADMIN") => void;
  onToggleActive: (id: string, active: boolean) => void;
}) {
  const avatarUrl = resolveImageUrl(user.avatarImageId, user.image, "sm", "profilepictures");

  return (
    <ListItem disableGutters sx={{ flexWrap: "wrap", gap: 1 }}>
      <ListItemAvatar>
        <Avatar src={avatarUrl ?? undefined}>{displayInitial(user.name)}</Avatar>
      </ListItemAvatar>
      <ListItemText
        primary={displayName(user.name)}
        secondary={`${user.email} · joined ${new Date(user.createdAt).toLocaleDateString()} · ${user._count.userBooks} books${user.active ? "" : " · deactivated"}`}
      />
      <Stack direction="row" spacing={1} alignItems="center">
        <ToggleButtonGroup
          value={user.role}
          exclusive
          size="small"
          disabled={isSelf || busy}
          onChange={(_, value: "USER" | "ADMIN" | null) => value && onChangeRole(user.id, value)}
        >
          <ToggleButton value="USER">User</ToggleButton>
          <ToggleButton value="ADMIN">Admin</ToggleButton>
        </ToggleButtonGroup>
        <Button
          size="small"
          variant="outlined"
          color={user.active ? "error" : "primary"}
          disabled={isSelf || busy}
          onClick={() => onToggleActive(user.id, !user.active)}
        >
          {user.active ? "Deactivate" : "Reactivate"}
        </Button>
      </Stack>
      {isSelf && (
        <Typography variant="caption" color="text.secondary" sx={{ width: "100%" }}>
          You can&apos;t change your own account here.
        </Typography>
      )}
    </ListItem>
  );
}
```

- [ ] **Step 2: Write the page**

Create `app/admin/users/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Box, Typography, CircularProgress, TextField, List, Divider } from "@mui/material";
import AdminUserRow, { type AdminUser } from "@/components/admin/AdminUserRow";

export default function AdminUsersPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch(`/api/admin/users${search ? `?q=${encodeURIComponent(search)}` : ""}`)
      .then((res) => {
        if (res.status === 401) {
          router.push("/login");
          return null;
        }
        if (!res.ok) throw new Error("Failed to load users");
        return res.json();
      })
      .then((data) => {
        if (data) setUsers(data);
      })
      .catch(() => setError("Could not load users. Please try again later."));
  }, [router, status, search]);

  async function patchUser(id: string, body: { role?: "USER" | "ADMIN"; active?: boolean }) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) {
        setError("Could not update that user. Please try again.");
        return;
      }
      const updated: AdminUser = await response.json();
      setUsers((prev) => (prev ? prev.map((u) => (u.id === updated.id ? updated : u)) : prev));
    } finally {
      setBusyId(null);
    }
  }

  if (status === "loading") return <CircularProgress sx={{ m: 4 }} />;
  if (status !== "authenticated" || session?.user?.role !== "ADMIN") {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="text.secondary">You&apos;re not authorized to view this page.</Typography>
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
  if (!users) return <CircularProgress sx={{ m: 4 }} />;

  return (
    <Box sx={{ maxWidth: 800, mx: "auto", p: { xs: 2, md: 4 } }}>
      <Typography variant="h5" gutterBottom>Users</Typography>
      <TextField
        size="small"
        label="Search name or email"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 3, minWidth: 280 }}
      />
      {users.length === 0 ? (
        <Typography color="text.secondary">No users match that search.</Typography>
      ) : (
        <List disablePadding>
          {users.map((user, index) => (
            <Box key={user.id}>
              <AdminUserRow
                user={user}
                isSelf={user.id === session.user.id}
                busy={busyId === user.id}
                onChangeRole={(id, role) => patchUser(id, { role })}
                onToggleActive={(id, active) => patchUser(id, { active })}
              />
              {index < users.length - 1 && <Divider component="li" />}
            </Box>
          ))}
        </List>
      )}
    </Box>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manually verify**

Signed in as the admin account, visit `/admin/users`: confirm the list loads, search filters it, the role toggle and deactivate button work end-to-end (state updates in place), your own row's controls are disabled, and a non-admin account visiting `/admin/users` sees the "not authorized" message instead of the list.

- [ ] **Step 5: Commit**

```bash
git add components/admin/AdminUserRow.tsx app/admin/users
git commit -m "feat: add /admin/users page"
```

---

### Task 8: `/admin/books` pages

**Files:**
- Create: `components/admin/AdminBookRow.tsx`
- Create: `app/admin/books/page.tsx`
- Create: `app/admin/books/new/page.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/books`, `DELETE /api/admin/books/[id]` from Task 6; `BarcodeScanner`, `IsbnLookupForm`, `ManualBookForm` (existing components, unchanged).
- Produces: `AdminBookRow` component, `type AdminBook`.

- [ ] **Step 1: Write `AdminBookRow`**

Create `components/admin/AdminBookRow.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ListItem, ListItemAvatar, Avatar, ListItemText, Chip, Button, Stack } from "@mui/material";
import ConfirmDialog from "@/components/ConfirmDialog";
import { resolveImageUrl } from "@/lib/storage/resolveImageUrl";

export interface AdminBook {
  id: string;
  isbn: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  coverImageId: string | null;
  source: string;
  fetchedAt: string;
  _count: { userBooks: number };
}

export default function AdminBookRow({ book, onDelete }: { book: AdminBook; onDelete: (id: string) => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const coverUrl = resolveImageUrl(book.coverImageId, book.coverUrl, "sm", "covers");

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete(book.id);
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <ListItem disableGutters sx={{ flexWrap: "wrap", gap: 1 }}>
      <ListItemAvatar>
        <Avatar variant="rounded" src={coverUrl ?? undefined}>{book.title.charAt(0).toUpperCase()}</Avatar>
      </ListItemAvatar>
      <ListItemText
        primary={<Link href={`/books/${book.id}`}>{book.title}</Link>}
        secondary={`${book.authors.join(", ") || "Unknown author"} · ${book.isbn} · fetched ${new Date(book.fetchedAt).toLocaleDateString()} · on ${book._count.userBooks} ${book._count.userBooks === 1 ? "shelf" : "shelves"}`}
      />
      <Stack direction="row" spacing={1} alignItems="center">
        <Chip size="small" label={book.source} variant="outlined" />
        <Button size="small" color="error" variant="outlined" onClick={() => setConfirming(true)}>
          Delete
        </Button>
      </Stack>

      <ConfirmDialog
        open={confirming}
        title="Delete this book?"
        message={`Delete "${book.title}" from the repository entirely? It will be removed from every shelf that has it. This can't be undone.`}
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        confirmColor="error"
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </ListItem>
  );
}
```

- [ ] **Step 2: Write the books list page**

Create `app/admin/books/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Box, Typography, CircularProgress, TextField, List, Divider, Button } from "@mui/material";
import AdminBookRow, { type AdminBook } from "@/components/admin/AdminBookRow";

export default function AdminBooksPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [books, setBooks] = useState<AdminBook[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch(`/api/admin/books${search ? `?q=${encodeURIComponent(search)}` : ""}`)
      .then((res) => {
        if (res.status === 401) {
          router.push("/login");
          return null;
        }
        if (!res.ok) throw new Error("Failed to load books");
        return res.json();
      })
      .then((data) => {
        if (data) setBooks(data);
      })
      .catch(() => setError("Could not load books. Please try again later."));
  }, [router, status, search]);

  async function deleteBook(id: string) {
    const response = await fetch(`/api/admin/books/${id}`, { method: "DELETE" });
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (!response.ok) {
      setError("Could not delete that book. Please try again.");
      return;
    }
    setBooks((prev) => (prev ? prev.filter((b) => b.id !== id) : prev));
  }

  if (status === "loading") return <CircularProgress sx={{ m: 4 }} />;
  if (status !== "authenticated" || session?.user?.role !== "ADMIN") {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="text.secondary">You&apos;re not authorized to view this page.</Typography>
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

  return (
    <Box sx={{ maxWidth: 800, mx: "auto", p: { xs: 2, md: 4 } }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, mb: 3, flexWrap: "wrap" }}>
        <Typography variant="h5">Books</Typography>
        <Button variant="contained" component={Link} href="/admin/books/new">
          Create book
        </Button>
      </Box>
      <TextField
        size="small"
        label="Search title, author, or ISBN"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 3, minWidth: 280 }}
      />
      {books.length === 0 ? (
        <Typography color="text.secondary">No books match that search.</Typography>
      ) : (
        <List disablePadding>
          {books.map((book, index) => (
            <Box key={book.id}>
              <AdminBookRow book={book} onDelete={deleteBook} />
              {index < books.length - 1 && <Divider component="li" />}
            </Box>
          ))}
        </List>
      )}
    </Box>
  );
}
```

- [ ] **Step 3: Write the book-creation page**

Create `app/admin/books/new/page.tsx` (mirrors `app/add/page.tsx`'s three-tab flow, but redirects to the book's own page instead of adding it to a shelf):

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Box, Typography, Alert, CircularProgress, Tabs, Tab } from "@mui/material";
import BarcodeScanner from "@/components/BarcodeScanner";
import IsbnLookupForm from "@/components/IsbnLookupForm";
import ManualBookForm from "@/components/ManualBookForm";

interface BookLike {
  id: string;
  title: string;
}

type Tab = "camera" | "lookup" | "manual";

export default function AdminNewBookPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [tab, setTab] = useState<Tab>("camera");
  const [scanStatus, setScanStatus] = useState<"scanning" | "looking-up" | "not-found" | "error">("scanning");
  const [message, setMessage] = useState<string | null>(null);

  function goToBook(book: BookLike) {
    router.push(`/books/${book.id}`);
  }

  async function handleDecode(isbn: string) {
    setScanStatus("looking-up");
    const response = await fetch(`/api/books/lookup?isbn=${encodeURIComponent(isbn)}`);
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (response.ok) {
      goToBook(await response.json());
      return;
    }
    setScanStatus("not-found");
    setMessage("No book found for that barcode.");
  }

  if (status === "loading") return <CircularProgress sx={{ m: 4 }} />;
  if (status !== "authenticated" || session?.user?.role !== "ADMIN") {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="text.secondary">You&apos;re not authorized to view this page.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: tab === "camera" ? 480 : 960, mx: "auto", mt: 4, px: { xs: 2, md: 0 } }}>
      <Typography variant="h5" gutterBottom>Create a book</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Adds this book to the shared repository only — it won&apos;t be added to your own shelf.
      </Typography>

      <Tabs value={tab} onChange={(_, value: Tab) => setTab(value)} sx={{ mb: 3 }}>
        <Tab label="Camera" value="camera" />
        <Tab label="Lookup" value="lookup" />
        <Tab label="Manual entry" value="manual" />
      </Tabs>

      {tab === "camera" && (
        <>
          {scanStatus === "scanning" && (
            <BarcodeScanner
              onDecode={handleDecode}
              onError={(msg) => {
                setScanStatus("error");
                setMessage(msg);
              }}
            />
          )}
          {scanStatus === "looking-up" && <CircularProgress sx={{ mt: 2 }} />}
          {(scanStatus === "not-found" || scanStatus === "error") && (
            <Alert severity="warning" sx={{ mt: 2 }}>{message}</Alert>
          )}
        </>
      )}

      {tab === "lookup" && <IsbnLookupForm onFound={goToBook} />}

      {tab === "manual" && (
        <Box sx={{ maxWidth: 560 }}>
          <ManualBookForm onCreated={goToBook} />
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manually verify**

Signed in as the admin account: visit `/admin/books`, confirm the list/search/delete flow works and a deleted book disappears from the list; visit `/admin/books/new`, create a book via the manual-entry tab, and confirm it redirects to `/books/[id]` and that the book does **not** appear on the admin's own `/bookshelf`. Confirm a non-admin visiting either page sees "not authorized".

- [ ] **Step 6: Commit**

```bash
git add components/admin/AdminBookRow.tsx app/admin/books
git commit -m "feat: add /admin/books pages"
```

---

### Task 9: Header nav link

**Files:**
- Modify: `components/AppHeader.tsx`

- [ ] **Step 1: Add the icon import**

In `components/AppHeader.tsx`, change:

```ts
import { Brightness4, Brightness7, QrCodeScanner, People, History } from "@mui/icons-material";
```

to:

```ts
import { Brightness4, Brightness7, QrCodeScanner, People, History, AdminPanelSettings } from "@mui/icons-material";
```

- [ ] **Step 2: Add the nav button**

In `components/AppHeader.tsx`, right after the Activity `IconButton` block (the one added by the friend-activity-feed feature, linking to `/activity`):

```tsx
          {session?.user && (
            <IconButton component={Link} href="/activity" color="inherit" aria-label="activity">
              <History />
            </IconButton>
          )}
```

add:

```tsx
          {session?.user?.role === "ADMIN" && (
            <IconButton component={Link} href="/admin/users" color="inherit" aria-label="admin panel">
              <AdminPanelSettings />
            </IconButton>
          )}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manually verify**

Confirm the admin icon appears in the header only when signed in as the admin account, and links to `/admin/users`; confirm it's absent for a non-admin account.

- [ ] **Step 5: Commit**

```bash
git add components/AppHeader.tsx
git commit -m "feat: link to the admin panel from the header"
```

---

### Task 10: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all tests pass, including the new `tests/lib/auth/requireAdmin.test.ts`.

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors/warnings introduced by this feature (any pre-existing warning elsewhere in the codebase is out of scope).

- [ ] **Step 4: End-to-end manual walkthrough**

With the admin account from Task 5 and a second, regular account that's friends with a third account:
1. As the regular account, confirm you can't reach `/admin/users`/`/admin/books` (redirected/"not authorized") and `GET /api/admin/*` 403s.
2. As the admin, deactivate the third account (the regular account's friend). Confirm: the third account can no longer sign in; the regular account's `/friends` page no longer lists them; `/activity` no longer shows their events; `/api/users/search` no longer finds them.
3. Reactivate the third account and confirm all of the above reverses immediately.
4. As the admin, create a book via `/admin/books/new` (any of the three tabs) and confirm it shows up in `/admin/books` and at `/books/[id]`, but not on the admin's own `/bookshelf`.
5. Delete that book from `/admin/books` and confirm it's gone from the repository.
6. As the admin, promote the regular account to ADMIN via `/admin/users`, confirm the admin icon now appears in their header too, then demote them back.
