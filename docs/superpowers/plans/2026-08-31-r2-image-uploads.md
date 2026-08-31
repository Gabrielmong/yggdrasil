# R2-Backed Image Uploads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in users upload book cover images and profile pictures to a Cloudflare R2 bucket, processed server-side into three WebP sizes (sm/md/full), resolved to the right size per UI context.

**Architecture:** A single upload route (`POST /api/uploads`) validates, resizes via `sharp` into three WebP variants, and stores them in R2 under a generated UID. The UID (not a URL) is what gets persisted (`Book.coverImageId`, `User.avatarImageId`), kept separate from the existing hotlinked-URL fields (`Book.coverUrl`, `User.image`) so nothing about the existing Google Books/Open Library/Google OAuth image flow changes. A pure `resolveImageUrl` function, called at the page level before handing a plain string down to existing display components, decides whether to build a sized R2 URL from the UID or fall back to the hotlinked URL.

**Tech Stack:** Next.js (App Router, TS), `sharp` (image processing), `@aws-sdk/client-s3` (R2 is S3-compatible), Prisma + PostgreSQL, MUI, Vitest.

**Spec:** [docs/superpowers/specs/2026-08-31-r2-image-uploads-design.md](../specs/2026-08-31-r2-image-uploads-design.md)

## Global Constraints

- Allowed upload types: `image/jpeg`, `image/png`, `image/webp`. Max size: 5MB. Enforced both client- and server-side (spec: Upload Pipeline).
- Three sizes, max longest edge, aspect preserved, never cropped, never upscaled: `sm` = 150px, `md` = 500px, `full` = 1200px.
- Uploaded images are identified by a UID, stored as flat R2 keys `${uid}-sm.webp`, `${uid}-md.webp`, `${uid}-full.webp` — no folder prefix needed (spec: Upload Pipeline).
- `Book.coverImageId`/`User.avatarImageId` are new, nullable, additive fields — never repurpose or remove the existing `coverUrl`/`image` fields (spec: Data Model).
- `BookDetailHeader.tsx`, `GenreTagList.tsx`, and `BookCard.tsx` are **never modified** by this plan — they already accept a plain `coverUrl: string | null` prop; all size resolution happens at the page level before that prop is passed (spec: Frontend Resolution).
- No presigned URLs — uploads proxy through our server (spec: Non-goals).
- No crop UI, no video/GIF uploads, no orphaned-object cleanup, no profile `name` editing, no extra permission gating beyond signed-in (spec: Non-goals).
- **This codebase is under active parallel development by the user.** Several files this plan touches (`lib/books/bookEditDiff.ts`, `app/api/books/[id]/route.ts`, `components/BookEditForm.tsx`, `components/AppHeader.tsx`, `app/bookshelf/page.tsx`, `app/books/[id]/page.tsx`) may have changed since this plan was written. Tasks that modify these files describe the **exact fields/behavior to add**, not a full-file replacement — read the current file first, then apply the described addition precisely, preserving everything else.
- Standing project constraint: clean, efficient code, no large files, everything componentized.

---

## File Structure

```
prisma/schema.prisma                    # MODIFY: add Book.coverImageId, User.avatarImageId
lib/storage/resolveImageUrl.ts          # NEW: pure URL-resolution function
lib/storage/r2.ts                       # NEW: R2 upload wrapper (@aws-sdk/client-s3)
app/api/uploads/route.ts                # NEW: POST — validate, resize, upload 3 sizes
lib/books/bookEditDiff.ts               # MODIFY: add coverImageId to EditableBookFields
app/api/books/[id]/route.ts             # MODIFY: accept/validate/diff coverImageId
components/ImageUploadButton.tsx        # NEW: reusable upload button
components/BookEditForm.tsx             # MODIFY: add cover upload option
app/api/profile/route.ts                # NEW: GET/PATCH — own profile, avatarImageId
app/profile/page.tsx                    # NEW: minimal avatar-upload page
components/AppHeader.tsx                # MODIFY: add nav link to /profile
app/bookshelf/page.tsx                  # MODIFY: resolve cover at "sm" for BookCard
app/books/[id]/page.tsx                 # MODIFY: resolve cover at "md" for BookDetailHeader
tests/lib/storage/resolveImageUrl.test.ts   # NEW
tests/lib/storage/r2.test.ts                # NEW
```

---

### Task 1: Prisma schema — `Book.coverImageId` and `User.avatarImageId`

**Files:**
- Modify: `prisma/schema.prisma`
- Test: manual verification via `prisma migrate dev`

**Interfaces:**
- Produces: `Book.coverImageId: String?`, `User.avatarImageId: String?` — both nullable, both consumed starting Task 5 (Book) and Task 8 (User).

- [ ] **Step 1: Add the two fields**

In the `Book` model, add `coverImageId` (anywhere among the other nullable `String?` fields, e.g. right after `coverUrl`):

```prisma
  coverImageId  String?
```

In the `User` model, add `avatarImageId` (e.g. right after `image`):

```prisma
  avatarImageId String?
```

- [ ] **Step 2: Run the migration**

```bash
npx prisma migrate dev --name image_ids
```

Expected: migration succeeds, adds both nullable columns.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add Book.coverImageId and User.avatarImageId for uploaded images"
```

---

### Task 2: `resolveImageUrl` pure function

**Files:**
- Create: `lib/storage/resolveImageUrl.ts`
- Test: `tests/lib/storage/resolveImageUrl.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export type ImageSize = "sm" | "md" | "full";
  export function resolveImageUrl(
    imageId: string | null,
    fallbackUrl: string | null,
    size: ImageSize
  ): string | null;
  ```
  Consumed by Task 9 (`/profile` page) and Task 10 (bookshelf/detail pages).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/storage/resolveImageUrl.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveImageUrl } from "@/lib/storage/resolveImageUrl";

describe("resolveImageUrl", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_URL", "https://images.example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds a sized R2 URL when imageId is present", () => {
    expect(resolveImageUrl("abc123", null, "sm")).toBe(
      "https://images.example.com/abc123-sm.webp"
    );
    expect(resolveImageUrl("abc123", null, "md")).toBe(
      "https://images.example.com/abc123-md.webp"
    );
    expect(resolveImageUrl("abc123", null, "full")).toBe(
      "https://images.example.com/abc123-full.webp"
    );
  });

  it("prefers imageId over fallbackUrl when both are present", () => {
    expect(resolveImageUrl("abc123", "https://example.com/hotlinked.jpg", "sm")).toBe(
      "https://images.example.com/abc123-sm.webp"
    );
  });

  it("returns fallbackUrl when imageId is null", () => {
    expect(resolveImageUrl(null, "https://example.com/hotlinked.jpg", "sm")).toBe(
      "https://example.com/hotlinked.jpg"
    );
  });

  it("returns null when both imageId and fallbackUrl are null", () => {
    expect(resolveImageUrl(null, null, "sm")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/storage/resolveImageUrl.test.ts`
Expected: FAIL — `Cannot find module '@/lib/storage/resolveImageUrl'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/storage/resolveImageUrl.ts
export type ImageSize = "sm" | "md" | "full";

/** Resolves the URL to display for an image: a sized R2 URL when an
 * uploaded image's uid is present, otherwise the hotlinked fallback URL
 * (from an API source or OAuth provider) as-is. */
export function resolveImageUrl(
  imageId: string | null,
  fallbackUrl: string | null,
  size: ImageSize
): string | null {
  if (imageId) {
    return `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${imageId}-${size}.webp`;
  }
  return fallbackUrl;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/storage/resolveImageUrl.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add resolveImageUrl pure function"
```

---

### Task 3: R2 upload wrapper (`lib/storage/r2.ts`)

**Files:**
- Create: `lib/storage/r2.ts`
- Test: `tests/lib/storage/r2.test.ts`
- Modify: `package.json` (new dependencies), `.env.example`

**Interfaces:**
- Produces: `uploadImage(key: string, buffer: Buffer, contentType: string): Promise<void>` — consumed by Task 4's upload route.

- [ ] **Step 1: Install dependencies**

```bash
npm install sharp @aws-sdk/client-s3
```

- [ ] **Step 2: Add R2 env vars to `.env.example`**

Append to the existing `.env.example`:

```
R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET_NAME=""
R2_PUBLIC_URL=""
NEXT_PUBLIC_R2_PUBLIC_URL=""
```

Note: `R2_PUBLIC_URL` and `NEXT_PUBLIC_R2_PUBLIC_URL` are the same value (the bucket's public base URL) — the `NEXT_PUBLIC_` copy exists because client components need it, and Next.js only inlines `NEXT_PUBLIC_`-prefixed vars into client bundles.

- [ ] **Step 3: Write the failing test**

```typescript
// tests/lib/storage/r2.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = sendMock;
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));

import { uploadImage } from "@/lib/storage/r2";

afterEach(() => {
  vi.clearAllMocks();
});

describe("uploadImage", () => {
  it("sends a PutObjectCommand with the given key, buffer, and content type", async () => {
    sendMock.mockResolvedValue({});
    const buffer = Buffer.from("fake-image-data");

    await uploadImage("abc123-sm.webp", buffer, "image/webp");

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({
      Key: "abc123-sm.webp",
      Body: buffer,
      ContentType: "image/webp",
    });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm run test -- tests/lib/storage/r2.test.ts`
Expected: FAIL — `Cannot find module '@/lib/storage/r2'`

- [ ] **Step 5: Write minimal implementation**

```typescript
// lib/storage/r2.ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

/** Uploads a single object to the R2 bucket under the given key. */
export async function uploadImage(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- tests/lib/storage/r2.test.ts`
Expected: PASS (1 test)

- [ ] **Step 7: Set real R2 credentials in `.env`**

Copy the new keys from `.env.example` into the real `.env` and fill in actual values from your Cloudflare R2 dashboard (Account ID, an R2 API token's Access Key ID/Secret, the bucket name, and the bucket's public URL — either R2.dev or a custom domain with public access enabled).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add R2 upload wrapper and sharp/aws-sdk dependencies"
```

---

### Task 4: `POST /api/uploads` — validate, resize, upload

**Files:**
- Create: `app/api/uploads/route.ts`

**Interfaces:**
- Consumes: `auth` (`lib/auth.ts`), `uploadImage` (`lib/storage/r2.ts`, Task 3), `sharp`.
- Produces: `POST /api/uploads` (`multipart/form-data`: `file`, `purpose`) → `201` with `{ uid: string }`; `400` on missing/invalid-type/oversized file; `401` unauthenticated.

- [ ] **Step 1: Write `app/api/uploads/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { auth } from "@/lib/auth";
import { uploadImage } from "@/lib/storage/r2";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const SIZES: { name: "sm" | "md" | "full"; maxDimension: number }[] = [
  { name: "sm", maxDimension: 150 },
  { name: "md", maxDimension: 500 },
  { name: "full", maxDimension: 1200 },
];

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, and WebP images are allowed" },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File must be 5MB or smaller" }, { status: 400 });
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const uid = randomUUID();

  await Promise.all(
    SIZES.map(async ({ name, maxDimension }) => {
      const resized = await sharp(inputBuffer)
        .resize({
          width: maxDimension,
          height: maxDimension,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp()
        .toBuffer();
      await uploadImage(`${uid}-${name}.webp`, resized, "image/webp");
    })
  );

  return NextResponse.json({ uid }, { status: 201 });
}
```

- [ ] **Step 2: Manual verification**

With `.env`'s real R2 credentials set and `npm run dev` running (or a standalone script, per this codebase's established pattern for verifying against live external services), sign in, then POST a real small JPEG/PNG to `/api/uploads` as `multipart/form-data` with fields `file` and `purpose=book-cover`. Confirm `201` with a `uid` in the response. Then fetch `${R2_PUBLIC_URL}/${uid}-sm.webp`, `-md.webp`, `-full.webp` directly (e.g. via `curl -I`) and confirm each returns `200` with `content-type: image/webp`. Also verify: a non-image file → `400`; a file over 5MB → `400`; an unauthenticated request → `401`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add POST /api/uploads route"
```

---

### Task 5: Extend book editing to accept `coverImageId`

**Files:**
- Modify: `lib/books/bookEditDiff.ts`
- Modify: `app/api/books/[id]/route.ts`

**Interfaces:**
- Produces: `EditableBookFields` gains `coverImageId: string | null`. `PATCH /api/books/[id]` accepts an optional `coverImageId` in its body alongside the existing `description`/`tags`/`coverUrl`, validated and diffed the same way, logged in `BookEdit` history the same way.
- Consumes: Task 1's `Book.coverImageId` column.

- [ ] **Step 1: Add `coverImageId` to `EditableBookFields`**

Read the current `lib/books/bookEditDiff.ts`. It exports an `EditableBookFields` interface currently shaped like:

```typescript
export interface EditableBookFields {
  description: string | null;
  tags: string[];
  coverUrl: string | null;
}
```

Add one field to it, immediately after `coverUrl`:

```typescript
  coverImageId: string | null;
```

Do not otherwise change `computeBookEditDiff`/`computeRevertDiff` — both already iterate generically over `Object.keys(...)`, so the new field is picked up automatically once it's part of the type. (If a security-fix pass has since added a `fieldsEqual` guard to `computeRevertDiff` — check for one — leave that guard's logic untouched; it applies to every field generically, including this new one.)

- [ ] **Step 2: Add `coverImageId` handling to the PATCH route**

Read the current `app/api/books/[id]/route.ts`. It currently destructures `description`, `tags`, `coverUrl` from the request body, validates each, and passes a `{ description, tags, coverUrl }`-shaped object as the patch into `computeBookEditDiff` (alongside a same-shaped "current" object built from the fetched `book` row). It may have been updated by a prior security-fix pass to read the book inside an interactive `prisma.$transaction(async (tx) => { ... })` rather than via a separate `prisma.book.findUnique` beforehand — if so, apply the following additions using `tx` consistently with the rest of that transaction, not a separate `prisma` call.

Add exactly these three things, mirroring the existing `coverUrl` handling for each:

1. Destructure `coverImageId` from the request body alongside the existing fields.
2. Validate it the same way `coverUrl` is validated:
   ```typescript
   if (coverImageId !== undefined && coverImageId !== null && typeof coverImageId !== "string") {
     return NextResponse.json({ error: "coverImageId must be a string or null" }, { status: 400 });
   }
   ```
3. Include `coverImageId` in both the "current" object (read from the book row, e.g. `book.coverImageId`) and the patch object passed to `computeBookEditDiff`, alongside the existing `description`/`tags`/`coverUrl` entries.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` and `npx eslint lib/books/bookEditDiff.ts "app/api/books/[id]/route.ts"`
Expected: both clean.

Run: `npm run test` — confirm the existing `tests/lib/books/bookEditDiff.test.ts` suite still passes unchanged (the new field doesn't break any existing test, since none of them pass `coverImageId` and the diff functions only act on keys actually present in a patch).

- [ ] **Step 4: Manual verification**

`PATCH /api/books/{id}` with `{ "coverImageId": "some-test-uid" }` (authenticated) — confirm `200`, the book's `coverImageId` updated, and a new `BookEdit` row with `previousValues: {"coverImageId": null}` / `newValues: {"coverImageId": "some-test-uid"}` (or whatever the prior value was).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: extend book editing to accept coverImageId"
```

---

### Task 6: `ImageUploadButton` — reusable upload control

**Files:**
- Create: `components/ImageUploadButton.tsx`

**Interfaces:**
- Consumes: `POST /api/uploads` (Task 4).
- Produces: `ImageUploadButton({ purpose: "book-cover" | "avatar", onUploaded: (uid: string) => void })` — consumed by Task 7 (`BookEditForm`) and Task 9 (`/profile` page).

- [ ] **Step 1: Write `components/ImageUploadButton.tsx`**

```typescript
"use client";

import { useState } from "react";
import { Button, CircularProgress, Typography, Box } from "@mui/material";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

interface ImageUploadButtonProps {
  purpose: "book-cover" | "avatar";
  onUploaded: (uid: string) => void;
}

/** Button + hidden file input that uploads an image to POST /api/uploads
 * and reports the resulting uid back once processing completes. */
export default function ImageUploadButton({ purpose, onUploaded }: ImageUploadButtonProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Only JPEG, PNG, and WebP images are allowed");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError("File must be 5MB or smaller");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("purpose", purpose);
      const response = await fetch("/api/uploads", { method: "POST", body: formData });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? "Upload failed. Please try again.");
        return;
      }
      const { uid } = await response.json();
      onUploaded(uid);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Box>
      <Button variant="outlined" component="label" disabled={uploading}>
        {uploading ? <CircularProgress size={20} /> : "Upload image"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={handleFileChange}
        />
      </Button>
      {error && (
        <Typography color="error" variant="body2" sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` and `npx eslint components/ImageUploadButton.tsx`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add ImageUploadButton component"
```

---

### Task 7: Wire cover upload into `BookEditForm`

**Files:**
- Modify: `components/BookEditForm.tsx`

**Interfaces:**
- Consumes: `ImageUploadButton` (Task 6), `EditableBookFields` (now including `coverImageId`, Task 5).
- Produces: saving from `BookEditForm` now optionally includes `coverImageId` in the patch handed to `onSave`.

- [ ] **Step 1: Add the upload option**

Read the current `components/BookEditForm.tsx`. Add, without changing its existing save/cancel/error-handling flow:

1. Import: `import ImageUploadButton from "@/components/ImageUploadButton";`
2. Local state for the pending uploaded image id, initialized from the book's current value:
   ```typescript
   const [coverImageId, setCoverImageId] = useState<string | null>(book.coverImageId);
   ```
3. In the JSX, near the existing "Cover image URL" `TextField`, add:
   ```typescript
   <ImageUploadButton purpose="book-cover" onUploaded={(uid) => setCoverImageId(uid)} />
   ```
   (A short explanatory line like "Or upload an image:" above it is reasonable, matching this form's existing style of separating its input options.)
4. In the object passed to `onSave` (wherever `description`/`tags`/`coverUrl` are currently assembled), add `coverImageId` alongside them.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` and `npx eslint components/BookEditForm.tsx`
Expected: both clean.

Run: `npm run test` — full suite still passes (this task adds no new tests; it's UI wiring on top of already-tested pieces).

- [ ] **Step 3: Manual verification**

On the book detail page, open "Edit details", use the new upload button to upload a real image, then click "Save changes" — confirm the book's cover updates and a `BookEdit` history entry appears listing `coverImageId` as a changed field.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add cover image upload option to BookEditForm"
```

---

### Task 8: `GET`/`PATCH /api/profile` — own profile, `avatarImageId`

**Files:**
- Create: `app/api/profile/route.ts`

**Interfaces:**
- Consumes: `prisma`, `auth`.
- Produces: `GET /api/profile` → `200` with `{ id, name, image, avatarImageId }` for the current user; `PATCH /api/profile` with `{ avatarImageId: string }` → `200` with the updated same shape. Both `401` unauthenticated.

- [ ] **Step 1: Write `app/api/profile/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, image: true, avatarImageId: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(user);
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { avatarImageId } = await request.json();
  if (typeof avatarImageId !== "string" || avatarImageId.length === 0) {
    return NextResponse.json({ error: "avatarImageId is required" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { avatarImageId },
    select: { id: true, name: true, image: true, avatarImageId: true },
  });

  return NextResponse.json(user);
}
```

- [ ] **Step 2: Manual verification**

`GET /api/profile` (authenticated) → `200` with your account's fields, `avatarImageId: null` initially. `PATCH /api/profile` with `{ "avatarImageId": "some-test-uid" }` → `200`, `avatarImageId` updated. Unauthenticated request to either → `401`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add GET/PATCH /api/profile for avatarImageId"
```

---

### Task 9: `/profile` page and header nav link

**Files:**
- Create: `app/profile/page.tsx`
- Modify: `components/AppHeader.tsx`

**Interfaces:**
- Consumes: `ImageUploadButton` (Task 6), `resolveImageUrl` (Task 2), `GET`/`PATCH /api/profile` (Task 8).
- Produces: `/profile` is reachable from the header when signed in, and lets the user upload and save a new avatar.

- [ ] **Step 1: Write `app/profile/page.tsx`**

```typescript
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Typography, CircularProgress, Button, Avatar } from "@mui/material";
import ImageUploadButton from "@/components/ImageUploadButton";
import { resolveImageUrl } from "@/lib/storage/resolveImageUrl";

interface Profile {
  id: string;
  name: string | null;
  image: string | null;
  avatarImageId: string | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pendingAvatarId, setPendingAvatarId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((res) => {
        if (res.status === 401) {
          router.push("/login");
          return null;
        }
        if (!res.ok) throw new Error("Failed to load profile");
        return res.json();
      })
      .then((data: Profile | null) => {
        if (data) setProfile(data);
      })
      .catch(() => setError("Could not load your profile. Please try again later."))
      .finally(() => setLoaded(true));
  }, [router]);

  async function handleSaveAvatar() {
    if (!pendingAvatarId) return;
    setSaving(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarImageId: pendingAvatarId }),
      });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) {
        setError("Could not save your profile picture. Please try again.");
        return;
      }
      setProfile(await response.json());
      setPendingAvatarId(null);
    } catch {
      setError("Could not save your profile picture. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <CircularProgress sx={{ m: 4 }} />;

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  if (!profile) return null;

  const avatarUrl = resolveImageUrl(pendingAvatarId ?? profile.avatarImageId, profile.image, "full");

  return (
    <Box
      sx={{
        maxWidth: 500,
        mx: "auto",
        p: 4,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        alignItems: "center",
      }}
    >
      <Typography variant="h5">Your profile</Typography>
      <Avatar src={avatarUrl ?? undefined} sx={{ width: 120, height: 120 }}>
        {profile.name?.[0]}
      </Avatar>
      <ImageUploadButton purpose="avatar" onUploaded={(uid) => setPendingAvatarId(uid)} />
      {pendingAvatarId && (
        <Button variant="contained" onClick={handleSaveAvatar} disabled={saving}>
          Save profile picture
        </Button>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Add a nav link to `/profile`**

Read the current `components/AppHeader.tsx` (the user has already added their own avatar-related work here — check for it). Add a way to reach `/profile` when signed in: if an avatar/user-icon element already exists in the header, wrap it in a `Link` (from `next/link`) to `/profile`; otherwise add a small icon button or text link to `/profile` near the existing sign-out control. Use your judgment on exact placement given the header's current actual layout — the only requirement is that `/profile` is reachable from the header for a signed-in user.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` and `npx eslint app/profile/page.tsx components/AppHeader.tsx`
Expected: both clean.

- [ ] **Step 4: Manual verification**

Sign in, navigate to `/profile` via the new header link, confirm it loads. Upload an avatar image, confirm the preview updates immediately (before saving — this is expected, since `avatarUrl` prefers `pendingAvatarId`), click "Save profile picture", confirm it persists (reload the page, confirm the saved avatar still shows).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add /profile page with avatar upload"
```

---

### Task 10: Resolve sized covers on the bookshelf and detail pages

**Files:**
- Modify: `app/bookshelf/page.tsx`
- Modify: `app/books/[id]/page.tsx`

**Interfaces:**
- Consumes: `resolveImageUrl` (Task 2), `coverImageId` now present on `Book` API responses (Task 5).
- Produces: `BookCard` (bookshelf) receives a `"sm"`-resolved cover URL; `BookDetailHeader` (detail page) receives a `"md"`-resolved cover URL — **without changing either component's props/interface**.

- [ ] **Step 1: Resolve at `"sm"` on the bookshelf page**

Read the current `app/bookshelf/page.tsx`. It fetches a list of shelved books and renders a `BookCard` per entry, each currently receiving `userBook.book.coverUrl` (via the `userBook` object's `book.coverUrl` field) as part of what's passed to `BookCard`. Import `resolveImageUrl` from `@/lib/storage/resolveImageUrl`, and wherever each book's `coverUrl` is used for display, substitute the resolved value instead — e.g., before rendering each `BookCard`, compute:

```typescript
const coverUrl = resolveImageUrl(userBook.book.coverImageId, userBook.book.coverUrl, "sm");
```

and pass a book object with this resolved `coverUrl` down to `BookCard` in place of the original (e.g. `{ ...userBook, book: { ...userBook.book, coverUrl } }`), so `BookCard` itself needs no changes — it still just receives a plain `coverUrl: string | null`.

Also add `coverImageId: string | null` to whatever local TypeScript interface this page uses to type each book's shape (mirroring how `tags: string[]` was added previously) — it needs to exist on the type before `resolveImageUrl` can read it.

- [ ] **Step 2: Resolve at `"md"` on the book detail page**

Read the current `app/books/[id]/page.tsx`. It renders `<BookDetailHeader book={userBook.book} />`. Add `coverImageId: string | null` to the page's local `UserBook`/`book` type (mirroring the existing `tags: string[]` field), import `resolveImageUrl`, and change the `BookDetailHeader` call site to pass a resolved cover instead of the raw one:

```typescript
<BookDetailHeader
  book={{
    ...userBook.book,
    coverUrl: resolveImageUrl(userBook.book.coverImageId, userBook.book.coverUrl, "md"),
  }}
/>
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` and `npx eslint app/bookshelf/page.tsx "app/books/[id]/page.tsx"`
Expected: both clean.

Run: `npm run test` — full suite passes (no new tests in this task; it's page-level wiring on top of already-tested `resolveImageUrl`).

- [ ] **Step 4: Manual verification**

Upload a cover for a book (via Task 7's UI), confirm the bookshelf grid shows the new cover (at whatever visual size `BookCard` renders — the underlying image is the sm/150px variant) and the book detail page shows it too (the md/500px variant). Confirm a book that still only has a hotlinked `coverUrl` (no `coverImageId`) continues to display exactly as before.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: resolve sized cover images on bookshelf and detail pages"
```

---

## Post-plan check

Run the full unit test suite once more:

```bash
npm run test
```

Expected: all existing tests plus the new tests in `tests/lib/storage/resolveImageUrl.test.ts` (4) and `tests/lib/storage/r2.test.ts` (1) pass.
