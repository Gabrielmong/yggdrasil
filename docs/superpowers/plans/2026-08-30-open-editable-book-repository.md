# Open, Editable Book Repository Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any signed-in user edit a book's `description`, `tags`, and `coverUrl` on the shared `Book` repository, with every change logged (who/when/what) and undoable, surfaced on the book detail page.

**Architecture:** A new `BookEdit` table logs every change to a book's editable fields as a before/after diff (only the fields that actually changed). A pure diff/revert module computes those diffs so the logic is unit-testable without touching Prisma. Two new nested API routes (edit history, revert) sit alongside a new `PATCH /api/books/[id]`. Three new UI components (a generalized collapsible chip list, an edit form, a history/undo list) are wired into the existing book detail page.

**Tech Stack:** Next.js (App Router, TS), Prisma + PostgreSQL, MUI, Vitest — same stack as the rest of the app, no new dependencies.

**Spec:** [docs/superpowers/specs/2026-08-30-open-editable-book-repository-design.md](../specs/2026-08-30-open-editable-book-repository-design.md)

## Global Constraints

- Only `description`, `tags`, and `coverUrl` are user-editable. `title`, `authors`, `isbn`, `pageCount`, `publishedYear`, and `genres` are never touched by this feature (spec: Non-goals).
- `tags` is a new field, separate from `genres` — `genres` stays exactly what the source API returned.
- Any signed-in user may edit any book; no extra permission gating (spec: Non-goals).
- Cover edits are a pasted URL, never uploaded/rehosted (spec: Non-goals).
- A revert creates a **new** `BookEdit` row documenting the revert itself — history is append-only, never deleted or rewritten (spec: API — revert route).
- Standing project constraint: clean, efficient code, no large files, everything componentized — split UI into small, single-purpose components as this plan already does; don't collapse them back into one file.

---

## File Structure

```
prisma/schema.prisma                          # MODIFY: add Book.tags, BookEdit model
lib/books/bookEditDiff.ts                      # NEW: pure diff/revert-diff logic
app/api/books/[id]/route.ts                    # NEW: PATCH — edit a book's shared fields
app/api/books/[id]/edits/route.ts              # NEW: GET — edit history
app/api/books/[id]/edits/[editId]/revert/route.ts  # NEW: POST — undo one edit
components/CollapsibleChipList.tsx             # NEW (replaces GenreTagList.tsx): generic collapsible chip list
components/BookEditForm.tsx                    # NEW: explicit edit form (description/tags/coverUrl)
components/BookEditHistory.tsx                 # NEW: history list + per-entry Undo
components/BookDetailHeader.tsx                # MODIFY: use CollapsibleChipList for genres + tags
app/books/[id]/page.tsx                        # MODIFY: fetch/wire edit history, edit form, revert
tests/lib/books/bookEditDiff.test.ts           # NEW
```

---

### Task 1: Prisma schema — `Book.tags` and `BookEdit`

**Files:**
- Modify: `prisma/schema.prisma`
- Test: manual verification via `prisma migrate dev` (schema correctness is verified by the migration succeeding)

**Interfaces:**
- Produces: `Book.tags: string[]` (default `[]`), `BookEdit` model with fields `id, bookId, editedById, editedAt, previousValues (Json), newValues (Json)` and relations `book -> Book`, `editedBy -> User`.

- [ ] **Step 1: Add `tags` to `Book` and the new `BookEdit` model**

In `prisma/schema.prisma`, add `tags` to the `Book` model and a `BookEdit` model, and back-relations on `User` and `Book`:

```prisma
model User {
  id            String     @id @default(cuid())
  email         String     @unique
  passwordHash  String?
  name          String?
  image         String?
  emailVerified DateTime?
  createdAt     DateTime   @default(now())

  accounts      Account[]
  sessions      Session[]
  userBooks     UserBook[]
  bookEdits     BookEdit[]
}
```

```prisma
model Book {
  id            String     @id @default(cuid())
  isbn          String     @unique
  title         String
  authors       String[]
  coverUrl      String?
  description   String?
  genres        String[]
  tags          String[]   @default([])
  pageCount     Int?
  publishedYear Int?
  source        BookSource
  rawResponse   Json?
  fetchedAt     DateTime   @default(now())

  userBooks     UserBook[]
  edits         BookEdit[]
}
```

```prisma
model BookEdit {
  id             String   @id @default(cuid())
  bookId         String
  editedById     String
  editedAt       DateTime @default(now())
  previousValues Json
  newValues      Json

  book     Book @relation(fields: [bookId], references: [id], onDelete: Cascade)
  editedBy User @relation(fields: [editedById], references: [id])
}
```

- [ ] **Step 2: Run the migration**

```bash
npx prisma migrate dev --name book_edits
```

Expected: migration succeeds, adds `tags` to `Book` and creates the `BookEdit` table.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add Book.tags and BookEdit schema for open book editing"
```

---

### Task 2: Pure diff/revert logic (`lib/books/bookEditDiff.ts`)

**Files:**
- Create: `lib/books/bookEditDiff.ts`
- Test: `tests/lib/books/bookEditDiff.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface EditableBookFields {
    description: string | null;
    tags: string[];
    coverUrl: string | null;
  }
  export type BookEditPatch = Partial<EditableBookFields>;
  export interface BookEditDiff {
    previousValues: BookEditPatch;
    newValues: BookEditPatch;
  }
  export function computeBookEditDiff(current: EditableBookFields, patch: BookEditPatch): BookEditDiff | null;
  export function computeRevertDiff(current: EditableBookFields, editToRevert: BookEditPatch): BookEditDiff | null;
  ```
  Both used by Task 3 (`PATCH /api/books/[id]`) and Task 5 (revert route). `null` means "nothing to change."

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/books/bookEditDiff.test.ts
import { describe, it, expect } from "vitest";
import { computeBookEditDiff, computeRevertDiff } from "@/lib/books/bookEditDiff";

const CURRENT = {
  description: "Old description",
  tags: ["classic"],
  coverUrl: "http://example.com/old.jpg",
};

describe("computeBookEditDiff", () => {
  it("returns a diff containing only the fields that changed", () => {
    const diff = computeBookEditDiff(CURRENT, { description: "New description" });

    expect(diff).toEqual({
      previousValues: { description: "Old description" },
      newValues: { description: "New description" },
    });
  });

  it("detects a changed tags array", () => {
    const diff = computeBookEditDiff(CURRENT, { tags: ["classic", "gothic"] });

    expect(diff).toEqual({
      previousValues: { tags: ["classic"] },
      newValues: { tags: ["classic", "gothic"] },
    });
  });

  it("handles multiple changed fields in one patch", () => {
    const diff = computeBookEditDiff(CURRENT, {
      description: "New description",
      coverUrl: null,
    });

    expect(diff).toEqual({
      previousValues: { description: "Old description", coverUrl: "http://example.com/old.jpg" },
      newValues: { description: "New description", coverUrl: null },
    });
  });

  it("returns null when the patch doesn't actually change anything", () => {
    const diff = computeBookEditDiff(CURRENT, {
      description: "Old description",
      tags: ["classic"],
    });

    expect(diff).toBeNull();
  });

  it("ignores fields not present in the patch", () => {
    const diff = computeBookEditDiff(CURRENT, { description: "New description" });

    expect(diff!.previousValues.tags).toBeUndefined();
    expect(diff!.newValues.coverUrl).toBeUndefined();
  });
});

describe("computeRevertDiff", () => {
  it("restores a single field, recording the current (bad) value as previousValues", () => {
    const diff = computeRevertDiff(
      { description: "Vandalized description", tags: ["classic"], coverUrl: "http://example.com/old.jpg" },
      { description: "Old description" } // the target edit's own previousValues
    );

    expect(diff).toEqual({
      previousValues: { description: "Vandalized description" },
      newValues: { description: "Old description" },
    });
  });

  it("restores multiple fields from a multi-field edit", () => {
    const diff = computeRevertDiff(
      { description: "Bad", tags: ["spam"], coverUrl: null },
      { description: "Good", tags: ["classic"] }
    );

    expect(diff).toEqual({
      previousValues: { description: "Bad", tags: ["spam"] },
      newValues: { description: "Good", tags: ["classic"] },
    });
  });

  it("returns null when the edit to revert touched no fields", () => {
    const diff = computeRevertDiff(
      { description: "Bad", tags: ["spam"], coverUrl: null },
      {}
    );

    expect(diff).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/books/bookEditDiff.test.ts`
Expected: FAIL — `Cannot find module '@/lib/books/bookEditDiff'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/books/bookEditDiff.ts
export interface EditableBookFields {
  description: string | null;
  tags: string[];
  coverUrl: string | null;
}

export type BookEditPatch = Partial<EditableBookFields>;

export interface BookEditDiff {
  previousValues: BookEditPatch;
  newValues: BookEditPatch;
}

function fieldsEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

function copyField<K extends keyof EditableBookFields>(
  key: K,
  value: EditableBookFields[K],
  target: BookEditPatch
) {
  target[key] = value;
}

/** Computes the previous/new-value diff for a patch against a book's
 * current editable fields — only the fields that actually changed. Returns
 * null if the patch doesn't change anything. */
export function computeBookEditDiff(
  current: EditableBookFields,
  patch: BookEditPatch
): BookEditDiff | null {
  const previousValues: BookEditPatch = {};
  const newValues: BookEditPatch = {};

  (Object.keys(patch) as (keyof EditableBookFields)[]).forEach((key) => {
    const newValue = patch[key];
    if (newValue === undefined) return;
    if (fieldsEqual(current[key], newValue)) return;
    copyField(key, current[key], previousValues);
    copyField(key, newValue as never, newValues);
  });

  if (Object.keys(newValues).length === 0) return null;
  return { previousValues, newValues };
}

/** Computes the diff for undoing a specific edit: previousValues = the
 * book's current values for the fields that edit touched (what's being
 * undone), newValues = that edit's own previousValues (what we're
 * restoring). */
export function computeRevertDiff(
  current: EditableBookFields,
  editToRevert: BookEditPatch
): BookEditDiff | null {
  const previousValues: BookEditPatch = {};
  const newValues: BookEditPatch = {};

  (Object.keys(editToRevert) as (keyof EditableBookFields)[]).forEach((key) => {
    const restoredValue = editToRevert[key];
    if (restoredValue === undefined) return;
    copyField(key, current[key], previousValues);
    copyField(key, restoredValue as never, newValues);
  });

  if (Object.keys(newValues).length === 0) return null;
  return { previousValues, newValues };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/books/bookEditDiff.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add pure diff/revert logic for book edits"
```

---

### Task 3: `PATCH /api/books/[id]` — edit a book's shared fields

**Files:**
- Create: `app/api/books/[id]/route.ts`

**Interfaces:**
- Consumes: `prisma`, `auth`, `computeBookEditDiff` from `lib/books/bookEditDiff.ts`.
- Produces: `PATCH /api/books/[id]` with body `{ description?, tags?, coverUrl? }` → `200` with the updated `Book` row (or the unchanged row if the patch was a no-op); `400` on invalid field types; `401` unauthenticated; `404` unknown book id.

- [ ] **Step 1: Write `app/api/books/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { computeBookEditDiff } from "@/lib/books/bookEditDiff";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const book = await prisma.book.findUnique({ where: { id } });
  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { description, tags, coverUrl } = await request.json();

  if (tags !== undefined && (!Array.isArray(tags) || !tags.every((t: unknown) => typeof t === "string"))) {
    return NextResponse.json({ error: "tags must be an array of strings" }, { status: 400 });
  }
  if (description !== undefined && description !== null && typeof description !== "string") {
    return NextResponse.json({ error: "description must be a string or null" }, { status: 400 });
  }
  if (coverUrl !== undefined && coverUrl !== null && typeof coverUrl !== "string") {
    return NextResponse.json({ error: "coverUrl must be a string or null" }, { status: 400 });
  }

  const diff = computeBookEditDiff(
    { description: book.description, tags: book.tags, coverUrl: book.coverUrl },
    { description, tags, coverUrl }
  );

  if (!diff) {
    return NextResponse.json(book);
  }

  const [updated] = await prisma.$transaction([
    prisma.book.update({ where: { id }, data: diff.newValues }),
    prisma.bookEdit.create({
      data: {
        bookId: id,
        editedById: session.user.id,
        previousValues: diff.previousValues,
        newValues: diff.newValues,
      },
    }),
  ]);

  return NextResponse.json(updated);
}
```

- [ ] **Step 2: Manual verification**

With `npm run dev` running and signed in, `PATCH /api/books/{a real book id}` with `{ "description": "A test description" }` — confirm `200`, the book's `description` updated, and a `BookEdit` row created (check via `npx prisma studio`: `previousValues: {"description": <old value>}`, `newValues: {"description": "A test description"}`). Repeat the exact same request — confirm it returns `200` with the unchanged book and creates **no** new `BookEdit` row (no-op patch).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add PATCH /api/books/[id] for editing shared book fields"
```

---

### Task 4: `GET /api/books/[id]/edits` — edit history

**Files:**
- Create: `app/api/books/[id]/edits/route.ts`

**Interfaces:**
- Consumes: `prisma`, `auth`.
- Produces: `GET /api/books/[id]/edits` → `200` with the book's `BookEdit[]`, newest first, each including `editedBy: { name, image }`. (Not `email` — any signed-in user can view any book's edit history, so exposing another user's email here would be a PII leak; `image` gives the UI an avatar option instead.)

- [ ] **Step 1: Write `app/api/books/[id]/edits/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const edits = await prisma.bookEdit.findMany({
    where: { bookId: id },
    orderBy: { editedAt: "desc" },
    include: { editedBy: { select: { name: true, image: true } } },
  });

  return NextResponse.json(edits);
}
```

- [ ] **Step 2: Manual verification**

After Task 3's manual edit, `GET /api/books/{id}/edits` (authenticated) — confirm `200` with an array containing that edit, `editedBy` populated with your account's name/image, newest first.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add GET /api/books/[id]/edits for edit history"
```

---

### Task 5: `POST /api/books/[id]/edits/[editId]/revert` — undo one edit

**Files:**
- Create: `app/api/books/[id]/edits/[editId]/revert/route.ts`

**Interfaces:**
- Consumes: `prisma`, `auth`, `computeRevertDiff` from `lib/books/bookEditDiff.ts`.
- Produces: `POST /api/books/[id]/edits/[editId]/revert` → `200` with the updated `Book` row; `401` unauthenticated; `404` if the book or edit doesn't exist, or the edit doesn't belong to that book.

- [ ] **Step 1: Write `app/api/books/[id]/edits/[editId]/revert/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { computeRevertDiff, type BookEditPatch } from "@/lib/books/bookEditDiff";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; editId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, editId } = await params;
  const [book, targetEdit] = await Promise.all([
    prisma.book.findUnique({ where: { id } }),
    prisma.bookEdit.findUnique({ where: { id: editId } }),
  ]);

  if (!book || !targetEdit || targetEdit.bookId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const diff = computeRevertDiff(
    { description: book.description, tags: book.tags, coverUrl: book.coverUrl },
    targetEdit.previousValues as BookEditPatch
  );

  if (!diff) {
    return NextResponse.json(book);
  }

  const [updated] = await prisma.$transaction([
    prisma.book.update({ where: { id }, data: diff.newValues }),
    prisma.bookEdit.create({
      data: {
        bookId: id,
        editedById: session.user.id,
        previousValues: diff.previousValues,
        newValues: diff.newValues,
      },
    }),
  ]);

  return NextResponse.json(updated);
}
```

- [ ] **Step 2: Manual verification**

`POST /api/books/{id}/edits/{editId from Task 3/4}/revert` (authenticated) — confirm `200`, the book's `description` restored to its pre-Task-3-edit value, and `GET /api/books/{id}/edits` now shows **two** entries: the original edit and this revert (with the revert's `previousValues` holding the value being undone and `newValues` holding the restored value).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add POST /api/books/[id]/edits/[editId]/revert"
```

---

### Task 6: Generalize the collapsible chip list for genres + tags

**Files:**
- Create: `components/CollapsibleChipList.tsx`
- Delete: `components/GenreTagList.tsx`
- Modify: `components/BookDetailHeader.tsx`

**Interfaces:**
- Produces: `CollapsibleChipList({ items: string[], variant?: "filled" | "outlined" })` — same collapse-when-long behavior `GenreTagList` had, generalized to a label and a chip variant so it can render both the API-sourced `genres` (filled, default) and the new user-editable `tags` (outlined) with a clear visual distinction.
- Consumes (in `BookDetailHeader`): `book.genres: string[]`, `book.tags: string[]` (the latter now present on the `Book` shape after Task 1's schema change).

- [ ] **Step 1: Write `components/CollapsibleChipList.tsx`**

```typescript
"use client";

import { useState } from "react";
import { Box, Chip, Stack, Button } from "@mui/material";

const COLLAPSED_COUNT = 6;

interface CollapsibleChipListProps {
  items: string[];
  variant?: "filled" | "outlined";
}

/** A chip list, collapsed to a short preview when it's long. Used for both
 * a book's API-sourced genres (filled) and its user-added tags (outlined),
 * so the two stay visually distinct. */
export default function CollapsibleChipList({ items, variant = "filled" }: CollapsibleChipListProps) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  const isLong = items.length > COLLAPSED_COUNT;
  const visible = expanded || !isLong ? items : items.slice(0, COLLAPSED_COUNT);

  return (
    <Box sx={{ my: 1 }}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
        {visible.map((item) => (
          <Chip key={item} label={item} size="small" variant={variant} />
        ))}
      </Stack>
      {isLong && (
        <Button size="small" onClick={() => setExpanded((prev) => !prev)} sx={{ mt: 1 }}>
          {expanded ? "Show less" : `Show all ${items.length}`}
        </Button>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Delete `components/GenreTagList.tsx`**

```bash
git rm components/GenreTagList.tsx
```

- [ ] **Step 3: Update `components/BookDetailHeader.tsx`**

```typescript
"use client";

import { Box, Typography } from "@mui/material";
import CollapsibleChipList from "@/components/CollapsibleChipList";

interface BookLike {
  title: string;
  authors: string[];
  coverUrl: string | null;
  description: string | null;
  genres: string[];
  tags: string[];
}

/** Read-only display of a book's cover, title, authors, genres, tags, and description. */
export default function BookDetailHeader({ book }: { book: BookLike }) {
  return (
    <Box sx={{ display: "flex", gap: 4 }}>
      {book.coverUrl && (
        <Box
          component="img"
          src={book.coverUrl}
          alt={book.title}
          sx={{
            maxWidth: 200,
            maxHeight: 300,
            width: "auto",
            height: "auto",
            borderRadius: 2,
            flexShrink: 0,
          }}
        />
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="h4">{book.title}</Typography>
        <Typography variant="subtitle1" color="text.secondary" gutterBottom>
          {book.authors.join(", ")}
        </Typography>
        <CollapsibleChipList items={book.genres} />
        <CollapsibleChipList items={book.tags} variant="outlined" />
        <Typography variant="body2">{book.description}</Typography>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` and `npx eslint components/CollapsibleChipList.tsx components/BookDetailHeader.tsx`
Expected: both clean. (`book.tags` doesn't exist on the `UserBook`/`book` shape consumed by `app/books/[id]/page.tsx` yet — that's Task 9; a type error there is expected and resolved by that task, not this one.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: generalize GenreTagList into CollapsibleChipList for genres+tags"
```

---

### Task 7: `BookEditForm` — explicit edit form for shared fields

**Files:**
- Create: `components/BookEditForm.tsx`

**Interfaces:**
- Consumes: `EditableBookFields` from `lib/books/bookEditDiff.ts` (Task 2) — reused here rather than redeclared, so the page (Task 9), this form, and the diff logic all share one type definition.
- Produces: a default-exported `BookEditForm({ book: EditableBookFields, onSave: (patch: Partial<EditableBookFields>) => Promise<void>, onCancel: () => void })` — consumed by Task 9's page wiring.

- [ ] **Step 1: Write `components/BookEditForm.tsx`**

```typescript
"use client";

import { useState } from "react";
import { Box, TextField, Button, Typography } from "@mui/material";
import type { EditableBookFields } from "@/lib/books/bookEditDiff";

interface BookEditFormProps {
  book: EditableBookFields;
  onSave: (patch: Partial<EditableBookFields>) => Promise<void>;
  onCancel: () => void;
}

/** Explicit edit form for a book's shared, community-editable fields
 * (description, tags, cover image) — requires an explicit save, since
 * these changes affect every user, not just the person editing. */
export default function BookEditForm({ book, onSave, onCancel }: BookEditFormProps) {
  const [description, setDescription] = useState(book.description ?? "");
  const [tags, setTags] = useState(book.tags.join(", "));
  const [coverUrl, setCoverUrl] = useState(book.coverUrl ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave({
      description: description.trim() || null,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      coverUrl: coverUrl.trim() || null,
    });
    setSaving(false);
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, my: 2 }}>
      <Typography variant="subtitle2">Edit book details</Typography>
      <TextField
        label="Description"
        multiline
        minRows={3}
        fullWidth
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <TextField
        label="Tags (comma-separated)"
        fullWidth
        value={tags}
        onChange={(e) => setTags(e.target.value)}
      />
      <TextField
        label="Cover image URL"
        fullWidth
        value={coverUrl}
        onChange={(e) => setCoverUrl(e.target.value)}
      />
      <Box sx={{ display: "flex", gap: 2 }}>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          Save changes
        </Button>
        <Button variant="text" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` and `npx eslint components/BookEditForm.tsx`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add BookEditForm for editing a book's shared fields"
```

---

### Task 8: `BookEditHistory` — history list with undo

**Files:**
- Create: `components/BookEditHistory.tsx`

**Interfaces:**
- Produces:
  ```typescript
  export interface BookEditEntry {
    id: string;
    editedAt: string;
    editedBy: { name: string | null; image: string | null };
    previousValues: Record<string, unknown>;
    newValues: Record<string, unknown>;
  }
  ```
  and a default-exported `BookEditHistory({ edits: BookEditEntry[], onRevert: (editId: string) => void })` — consumed by Task 9.

- [ ] **Step 1: Write `components/BookEditHistory.tsx`**

```typescript
"use client";

import { Box, Typography, Button, Stack } from "@mui/material";

export interface BookEditEntry {
  id: string;
  editedAt: string;
  editedBy: { name: string | null; image: string | null };
  previousValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
}

interface BookEditHistoryProps {
  edits: BookEditEntry[];
  onRevert: (editId: string) => void;
}

function summarizeFields(newValues: Record<string, unknown>): string {
  const fields = Object.keys(newValues);
  return fields.length === 0 ? "no fields" : fields.join(", ");
}

/** List of past edits to a book's shared fields, each with an "Undo"
 * action. Renders nothing when there's no history yet. */
export default function BookEditHistory({ edits, onRevert }: BookEditHistoryProps) {
  if (edits.length === 0) return null;

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="subtitle2" gutterBottom>Edit history</Typography>
      <Stack spacing={1}>
        {edits.map((edit) => (
          <Box key={edit.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
              {edit.editedBy.name ?? "A community member"} changed {summarizeFields(edit.newValues)} —{" "}
              {new Date(edit.editedAt).toLocaleString()}
            </Typography>
            <Button size="small" onClick={() => onRevert(edit.id)}>Undo</Button>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` and `npx eslint components/BookEditHistory.tsx`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add BookEditHistory list with per-entry undo"
```

---

### Task 9: Wire editing into the book detail page

**Files:**
- Modify: `app/books/[id]/page.tsx`

**Interfaces:**
- Consumes: `CollapsibleChipList` (via `BookDetailHeader`, already wired in Task 6), `BookEditForm` (Task 7) and `EditableBookFields` (Task 2), `BookEditHistory`/`BookEditEntry` (Task 8), `PATCH /api/books/[id]` (Task 3), `GET /api/books/[id]/edits` (Task 4), `POST /api/books/[id]/edits/[editId]/revert` (Task 5).
- Produces: the book detail page now shows an "Edit details" toggle, the edit form, the edit history with undo, alongside the existing per-user status/rating/notes editor.

- [ ] **Step 1: Rewrite `app/books/[id]/page.tsx`**

```typescript
"use client";

import { useEffect, useState, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Box, CircularProgress, Typography, Button } from "@mui/material";
import BookDetailHeader from "@/components/BookDetailHeader";
import BookStatusEditor, { UserBookFields } from "@/components/BookStatusEditor";
import BookEditForm from "@/components/BookEditForm";
import BookEditHistory, { BookEditEntry } from "@/components/BookEditHistory";
import type { EditableBookFields } from "@/lib/books/bookEditDiff";

interface UserBook extends UserBookFields {
  id: string;
  startedAt: string | null;
  book: {
    id: string;
    title: string;
    authors: string[];
    coverUrl: string | null;
    description: string | null;
    genres: string[];
    tags: string[];
  };
}

export default function BookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [userBook, setUserBook] = useState<UserBook | null>(null);
  const [edits, setEdits] = useState<BookEditEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingBook, setEditingBook] = useState(false);

  const loadEdits = useCallback(async (bookId: string) => {
    const response = await fetch(`/api/books/${bookId}/edits`);
    if (response.ok) setEdits(await response.json());
  }, []);

  useEffect(() => {
    fetch("/api/user-books")
      .then((res) => {
        if (res.status === 401) {
          router.push("/login");
          return null;
        }
        if (!res.ok) {
          throw new Error("Failed to load book");
        }
        return res.json();
      })
      .then((all: UserBook[] | null) => {
        const match = all?.find((ub) => ub.book.id === id) ?? null;
        setUserBook(match);
        if (match) loadEdits(match.book.id);
      })
      .catch(() => setError("Could not load this book. Please try again later."))
      .finally(() => setLoaded(true));
  }, [id, router, loadEdits]);

  async function updateField(data: Partial<UserBookFields>) {
    if (!userBook) return;
    const response = await fetch(`/api/user-books/${userBook.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (!response.ok) {
      setError("Could not save your changes. Please try again.");
      return;
    }
    setUserBook(await response.json());
  }

  async function saveBookEdit(patch: Partial<EditableBookFields>) {
    if (!userBook) return;
    const response = await fetch(`/api/books/${userBook.book.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (!response.ok) {
      setError("Could not save this book's details. Please try again.");
      return;
    }
    const updatedBook = await response.json();
    setUserBook((prev) => (prev ? { ...prev, book: { ...prev.book, ...updatedBook } } : prev));
    await loadEdits(userBook.book.id);
    setEditingBook(false);
  }

  async function revertEdit(editId: string) {
    if (!userBook) return;
    const response = await fetch(`/api/books/${userBook.book.id}/edits/${editId}/revert`, {
      method: "POST",
    });
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (!response.ok) {
      setError("Could not undo that edit. Please try again.");
      return;
    }
    const updatedBook = await response.json();
    setUserBook((prev) => (prev ? { ...prev, book: { ...prev.book, ...updatedBook } } : prev));
    await loadEdits(userBook.book.id);
  }

  if (!loaded) return <CircularProgress sx={{ m: 4 }} />;

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  if (!userBook) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="text.secondary">This book isn&apos;t on your shelf.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 700, mx: "auto", p: 4 }}>
      <BookDetailHeader book={userBook.book} />
      {editingBook ? (
        <BookEditForm book={userBook.book} onSave={saveBookEdit} onCancel={() => setEditingBook(false)} />
      ) : (
        <Button size="small" onClick={() => setEditingBook(true)} sx={{ mt: 1 }}>
          Edit details
        </Button>
      )}
      <BookEditHistory edits={edits} onRevert={revertEdit} />
      <Box sx={{ mt: 3 }}>
        <BookStatusEditor userBook={userBook} onUpdate={updateField} />
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Manual verification**

Run `npm run dev`, open a book's detail page. Confirm: "Edit details" toggles the form; saving a description/tags/cover-URL change persists and reflects immediately in `BookDetailHeader` (tags show as outlined chips, distinct from genres); the edit history section appears with your change listed; clicking "Undo" restores the previous value and adds a new history entry for the revert. Confirm `npx tsc --noEmit`, `npx eslint .`, and `npm run test` (still 20/20 plus the new 8 from Task 2 = 28) all stay clean.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: wire book editing (edit form + history + undo) into the detail page"
```

---

## Post-plan check

Run the full unit test suite once more:

```bash
npm run test
```

Expected: all existing tests plus the new 8 in `tests/lib/books/bookEditDiff.test.ts` pass (28 total).
