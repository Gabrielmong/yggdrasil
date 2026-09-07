# Admin Panel — Design

Date: 2026-09-06
Status: Approved for planning

## Summary

Adds a `role` (USER/ADMIN) and an `active` flag to `User`, and a new
`/admin` panel visible only to ADMIN users: a searchable user list (change
role, deactivate/reactivate) and a searchable book catalog (create a book
directly into the shared repository without adding it to the admin's own
shelf, delete a book entirely). Deactivating a user blocks their login and
hides them from friends, without touching their underlying data.

## Goals

- `Role` enum (`USER`, `ADMIN`) on `User`, defaulting to `USER`.
- `active` boolean on `User`, defaulting to `true`.
- `/admin/users`: list every user (search by name/email), see general info
  (join date, role, active status, shelf size), change a user's role,
  deactivate/reactivate a user.
- `/admin/books`: list every book in the repo (search by title/author/
  ISBN), see general info (source, ISBN, fetched date, how many shelves
  it's on), create a book directly (no shelf side-effect), delete a book.
- A deactivated user can't sign in (existing sessions stop working too),
  and disappears from their friends' friend lists/profiles/activity feed/
  search results — reversible by reactivating them.
- Every `/api/admin/*` route and both admin pages are inaccessible to a
  non-admin (403 / redirect), same as any other protected route in this
  app.

## Non-goals (this round)

- A generic multi-role/permission system — this is a binary USER/ADMIN
  flag, not a roles-and-permissions framework.
- Promoting the very first admin from the UI — that's a one-time direct
  DB edit (documented in the plan), same tier of operation as running a
  migration.
- An admin acting on their own account from the panel (self-deactivate,
  self-demote) — blocked outright; requires the same direct DB edit as
  bootstrapping the first admin.
- Editing an existing book's fields from the admin panel — that already
  works for any signed-in user via the existing book-detail edit flow
  (`app/books/[id]`); the panel only adds create + delete.
- Audit log of admin actions (who deactivated whom, when) — not tracked
  beyond what `updatedAt` already shows.
- Any change to the friend-request/search flow beyond excluding inactive
  users from results.

## Data Model

```prisma
enum Role {
  USER
  ADMIN
}
```

`User` gains:

```prisma
role   Role    @default(USER)
active Boolean @default(true)
```

No new tables. `active` defaults to `true` so every existing row is
unaffected by the migration.

## Auth Enforcement

- **Server-side guard:** `lib/auth/requireAdmin.ts` exports
  `requireAdmin()`, mirroring the existing
  `const session = await auth(); if (!session?.user?.id) return 401`
  idiom used by every route in this app — it additionally checks
  `session.user.role === "ADMIN"`, returning a 403
  (`{ error: "Forbidden" }`) otherwise. Every `/api/admin/*` route calls
  it first, exactly like every other route calls the 401 check first.
- **Session shape:** `lib/auth.ts`'s `jwt`/`session` callbacks (the same
  place `token.id`/`session.user.id` are already threaded through) gain
  `role`, so `session.user.role` is available both server- and
  client-side without an extra fetch.
- **Client-side guard:** `/admin/users` and `/admin/books` check
  `session.user.role !== "ADMIN"` (via `useSession`, same hook
  `AppHeader.tsx` already uses) and render the same "not authorized"
  plain-text pattern the friends pages use for `notFriends`, rather than
  the page content.
- **Blocking login:** both `authorize()` callbacks in `lib/auth.ts`
  (Google credential and email/password) return `null` — the existing
  "auth failed" convention — when the resolved `user.active === false`.
- **Killing an existing session:** sessions are JWT-strategy (stateless),
  so a token issued before deactivation would otherwise stay valid until
  it expires. The `jwt` callback re-reads `active`/`role` from the
  database on every call (a single indexed lookup by the token's user id
  — cheap at this app's scale) and, if the user is no longer active,
  drops `token.id`; the `session` callback then leaves `session.user.id`
  unset, which every existing page/route already treats as "not signed
  in" (redirect to `/login` client-side, 401 server-side).
- **Hiding from friends:** every existing query that turns "my accepted
  friendships" into visible friend data adds `active: true` to its user
  filter — `GET /api/friendships`, `GET /api/friends/[userId]/*`
  (books/profile/stats/compare — 403 "not friends", same as today's
  not-yet-friends case), `GET /api/activity` (friend-id collection),
  and `GET /api/users/search` (excluded from results entirely, so no new
  friend request can target them). The `Friendship` row itself is never
  touched, so reactivating a user restores every one of these
  immediately.
- **Self-protection:** `PATCH /api/admin/users/[id]` 400s if the target
  id equals the caller's own id — an admin cannot deactivate or demote
  themselves through the panel.

## API Routes

All routes below require `requireAdmin()` (401 unauthenticated, 403
non-admin).

- **`GET /api/admin/users?q=`** — every user (optionally filtered by
  name/email, case-insensitive `contains`, same pattern as
  `/api/users/search`), each with `id`, `name`, `email`, avatar fields,
  `createdAt`, `role`, `active`, and `_count.userBooks` (shelf size).
  Ordered by `createdAt` desc.
- **`PATCH /api/admin/users/[id]`** — body `{ role?: "USER" | "ADMIN",
  active?: boolean }`. 400 if the target is the caller; 400 if `role` is
  present and not a valid `Role`; 404 if the target doesn't exist.
  Returns the updated user (same shape as the list route's rows).
- **`GET /api/admin/books?q=`** — every book, optionally filtered by
  `q` against title or ISBN (Prisma `contains`, case-insensitive) OR
  against `authors` (a `String[]`, which Prisma can't substring-match
  directly — filtered in application code: fetch the title/ISBN-filtered
  candidates plus everything else at this app's scale, then keep rows
  where any author string contains `q`, case-insensitive). Each row
  includes the existing serialized book taxonomy shape plus
  `_count.userBooks`. Ordered by `fetchedAt` desc.
- **`DELETE /api/admin/books/[id]`** — deletes the `Book` row (cascades
  to `UserBook`/`BookEdit`/taxonomy links exactly as the schema's
  existing `onDelete: Cascade` already specifies — this is the same
  cascade that already fires when the schema is exercised elsewhere, not
  new behavior). 404 if the book doesn't exist.
- Book **creation** reuses the existing `POST /api/books/manual` and
  `GET /api/books/lookup` routes unchanged — both already create/return a
  `Book` without touching `UserBook` (confirmed: `app/add/page.tsx` calls
  these, then separately calls `POST /api/user-books` as its own step).
  No new creation endpoint is needed; the admin book-creation UI simply
  never takes that second step.

## UI

- **`/admin/users`** (new top-level page): search box, then a table/list
  (avatar, name, email, joined date, role, active badge, shelf size).
  Each row has a role toggle (`ToggleButtonGroup` USER/ADMIN, matching
  the toggle pattern already used in `IsbnLookupForm`) and a
  deactivate/reactivate `Button`, both disabled on the caller's own row
  (with a tooltip explaining why). Errors from a failed
  `PATCH` surface inline near the row, matching this app's existing
  inline-error convention.
- **`/admin/books`** (new top-level page): search box, a table/list
  (cover thumbnail, title, authors, source chip, ISBN, fetched date,
  shelf count), a delete action per row behind the existing themed
  confirm-dialog pattern (the one already used for removing a book from
  your own shelf), and a "Create book" button that opens the exact same
  three-tab flow as `/add` (`BarcodeScanner` / `IsbnLookupForm` /
  `ManualBookForm`) in a dialog or its own `/admin/books/new` route —
  on success (`onDecode`/`onFound`/`onCreated`) it redirects to
  `/books/[id]` instead of calling `POST /api/user-books`.
- **Header** (`AppHeader.tsx`): a new icon (e.g. `AdminPanelSettings`
  from `@mui/icons-material`) next to the existing icons, rendered only
  when `session?.user?.role === "ADMIN"`, linking to `/admin/users`.

## Error Handling

- Non-admin hitting any `/api/admin/*` route → 403, same shape as every
  other authorization failure in this app (`{ error: "Forbidden" }`).
- Non-admin visiting `/admin/*` directly → the page renders a plain
  "not authorized" message client-side, same tone as the friends pages'
  `notFriends` state, rather than a blank page or crash.
- Admin attempting to act on their own row → 400, surfaced inline
  (buttons are disabled client-side too, so this is a defense-in-depth
  guard against a direct API call, not the primary UX).
- A deactivated user attempting to sign in → the existing login page's
  generic "invalid credentials"/OAuth-failure message (no special
  "you've been deactivated" copy — consistent with this app not
  distinguishing other auth failure reasons today either).

## Testing

- `requireAdmin()` and the self-protection check in
  `PATCH /api/admin/users/[id]` are pure enough logic to unit test
  under `tests/lib/auth/` (mirroring `tests/lib/friends/`), given a
  fixture session/user shape.
- The `active: true` filter addition across the friends/activity/search
  routes and the admin routes themselves stay manual verification during
  implementation — consistent with this codebase's existing practice of
  no route-level test suite (see the Friends and Activity Feed specs'
  Testing sections).
