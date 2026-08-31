# Phase 1 — Core Reading Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a working single-player reading tracker — sign in with Google or email/password, scan a book's barcode (or enter it manually) to look up its metadata via Google Books/Open Library and cache it, add it to a Want to Read / Reading / Read shelf, view the shelf and book detail pages — all in a MUI moss-green light/dark theme.

**Architecture:** Next.js (App Router) + TypeScript app. Route Handlers under `app/api/**` talk to Prisma/Postgres directly (no separate backend). Auth.js (NextAuth v5) with Google + Credentials providers via the Prisma adapter. Book metadata is fetched from Google Books first, gap-filled from Open Library, and cached permanently in a `Book` table keyed by ISBN so repeat lookups never re-hit external APIs.

**Tech Stack:** Next.js (App Router, TS), MUI (`@mui/material`, `@mui/icons-material`), Prisma + PostgreSQL, `next-auth@beta` (Auth.js v5) + `@auth/prisma-adapter`, `bcryptjs`, `@zxing/browser`, Vitest for unit tests.

**Spec:** [docs/superpowers/specs/2026-08-30-yggdrasil-reading-tracker-design.md](../specs/2026-08-30-yggdrasil-reading-tracker-design.md)

## Global Constraints

- Reading states are exactly: `WANT_TO_READ`, `READING`, `READ` (spec: Data Model).
- `Book` is a shared cache keyed by unique `isbn`; never call Google Books or Open Library for an ISBN already in the `Book` table (spec: Scan → Lookup Pipeline).
- Genres/subjects stay as raw `string[]` — no normalized Genre table in Phase 1 (spec: Non-goals).
- Cover images are hotlinked (store the source URL), never re-hosted (spec: Non-goals).
- No component/e2e test suite in v1 — only unit tests for pure logic (lookup merge, password hashing); UI flows verified manually (spec: Testing).
- Auth: Google OAuth + Credentials (bcrypt password hash) only — no other OAuth providers (spec: Tech Stack).
- This project is not yet a git repository — Task 1 initializes one.

---

## File Structure

```
prisma/schema.prisma              # User/Account/Session/VerificationToken (Auth.js) + Book, UserBook
lib/prisma.ts                     # Prisma client singleton
lib/passwords.ts                  # hashPassword / verifyPassword (bcrypt)
lib/auth.ts                       # Auth.js v5 config (handlers, auth, signIn, signOut)
lib/theme.ts                      # MUI light/dark theme (moss-green palette)
lib/theme-mode-context.tsx        # ThemeModeProvider + useThemeMode (localStorage-backed toggle)
lib/books/types.ts                # BookData interface
lib/books/googleBooks.ts          # fetchFromGoogleBooks
lib/books/openLibrary.ts          # fetchFromOpenLibrary
lib/books/mergeBookData.ts        # mergeBookData (pure merge/fallback logic)
app/api/auth/[...nextauth]/route.ts   # Auth.js route handlers
app/api/auth/register/route.ts        # Credentials sign-up
app/api/books/lookup/route.ts         # GET cache-or-fetch-or-404
app/api/books/manual/route.ts         # POST manual book entry
app/api/user-books/route.ts           # GET list mine / POST add to shelf
app/api/user-books/[id]/route.ts      # PATCH update status/rating/notes/dates
app/providers.tsx                 # SessionProvider + ThemeModeProvider + MUI ThemeProvider/CssBaseline
app/layout.tsx                    # Root layout wiring Providers + AppHeader
components/AppHeader.tsx          # Nav bar + dark/light toggle + sign out
app/login/page.tsx                # Sign in (Google button + email/password form)
app/register/page.tsx             # Sign up (email/password form)
app/scan/page.tsx                 # Camera scan screen
components/BarcodeScanner.tsx     # @zxing/browser wrapper, emits decoded ISBN
components/ManualBookEntry.tsx    # Fallback form (ISBN retype or full manual fields)
app/bookshelf/page.tsx            # Shelf tabs + grid
components/BookCard.tsx           # Cover/title/author/rating card
app/books/[id]/page.tsx           # Book detail + edit (status/rating/notes/dates)
proxy.ts                          # Redirect unauthenticated users to /login (Next.js 16: proxy, not middleware)
vitest.config.ts                  # Vitest setup
tests/lib/passwords.test.ts
tests/lib/books/googleBooks.test.ts
tests/lib/books/openLibrary.test.ts
tests/lib/books/mergeBookData.test.ts
```

---

### Task 1: Project scaffold, tooling, and git init

**Files:**
- Create: `package.json` (overwrite existing placeholder), `tsconfig.json`, `next.config.ts`, `.gitignore`, `.env.example`, `vitest.config.ts`, `app/layout.tsx` (minimal placeholder, replaced in Task 6), `app/page.tsx` (minimal placeholder)
- Modify: none (repo has only a placeholder `package.json` today)

**Interfaces:**
- Produces: an npm project with `dev`/`build`/`start`/`test` scripts, TypeScript configured for the App Router, Vitest wired to run `tests/**/*.test.ts`.

- [ ] **Step 1: Initialize git**

```bash
cd c:/projects/yggdrasil
git init
```

- [ ] **Step 2: Scaffold Next.js app in place**

Run (accept TypeScript, App Router, no `src/` dir, Tailwind: No, ESLint: Yes):

```bash
npx create-next-app@latest . --typescript --app --no-src-dir --eslint --no-tailwind --import-alias "@/*" --use-npm
```

This will refuse to overwrite the existing `package.json`/`description` — when prompted about existing files, allow it to merge/overwrite `package.json` (we replace it in the next step anyway).

- [ ] **Step 3: Install remaining dependencies**

```bash
npm install @mui/material @mui/icons-material @emotion/react @emotion/styled
npm install @prisma/client next-auth@beta @auth/prisma-adapter bcryptjs @zxing/browser
npm install -D prisma vitest @vitejs/plugin-react vite-tsconfig-paths @types/bcryptjs
```

- [ ] **Step 4: Add `.env.example`**

```
DATABASE_URL="postgresql://user:password@localhost:5432/yggdrasil"
AUTH_SECRET="generate-with-npx-auth-secret"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
```

- [ ] **Step 5: Add `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 6: Add `test` script to `package.json`**

Edit the `"scripts"` block so it includes:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run"
}
```

- [ ] **Step 7: Verify the scaffold builds and the test runner works**

Run: `npm run test`
Expected: Vitest reports "No test files found" (exit code may be non-zero for zero tests — that's fine, confirms Vitest itself runs); then run `npm run dev` briefly and confirm it starts without error, then stop it (Ctrl+C).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with MUI, Prisma, Auth.js, Vitest deps"
```

---

### Task 2: Prisma schema, client singleton, and migration

**Files:**
- Create: `prisma/schema.prisma`, `lib/prisma.ts`
- Test: manual verification via `prisma migrate dev` (schema correctness is verified by the migration succeeding; no unit test for the schema itself)

**Interfaces:**
- Produces: `lib/prisma.ts` exporting `prisma: PrismaClient` (singleton, safe for Next.js dev hot-reload).
- Produces: Prisma models `User`, `Account`, `Session`, `VerificationToken` (Auth.js adapter shape), `Book`, `UserBook`, enums `BookSource`, `ReadStatus`.

- [ ] **Step 1: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

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
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

enum BookSource {
  GOOGLE_BOOKS
  OPEN_LIBRARY
  MANUAL
}

model Book {
  id            String     @id @default(cuid())
  isbn          String     @unique
  title         String
  authors       String[]
  coverUrl      String?
  description   String?
  genres        String[]
  pageCount     Int?
  publishedYear Int?
  source        BookSource
  rawResponse   Json?
  fetchedAt     DateTime   @default(now())

  userBooks     UserBook[]
}

enum ReadStatus {
  WANT_TO_READ
  READING
  READ
}

model UserBook {
  id         String     @id @default(cuid())
  userId     String
  bookId     String
  status     ReadStatus
  rating     Int?
  notes      String?
  startedAt  DateTime?
  finishedAt DateTime?
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  book Book @relation(fields: [bookId], references: [id], onDelete: Cascade)

  @@unique([userId, bookId])
}
```

- [ ] **Step 2: Write `prisma.config.ts`**

Note: Prisma 7 (pinned in Task 1) no longer supports `datasource.url` in
`schema.prisma` — the connection URL for Migrate now lives in
`prisma.config.ts`, and `PrismaClient` requires a runtime driver adapter
(see Step 3). Install the adapter deps first:

```bash
npm install pg @prisma/adapter-pg dotenv
npm install -D @types/pg
```

```typescript
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
```

- [ ] **Step 3: Write `lib/prisma.ts`**

```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 4: Set up `DATABASE_URL` and run the migration**

Copy `.env.example` to `.env` and fill in a real Postgres connection string (a local Postgres via Docker, or a hosted Neon/Supabase instance — either works for dev). Then:

```bash
npx prisma migrate dev --name init
```

Expected: migration succeeds and creates the tables listed above.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Prisma schema (User/Account/Session, Book, UserBook) and client singleton"
```

---

### Task 3: Password hashing helper

**Files:**
- Create: `lib/passwords.ts`
- Test: `tests/lib/passwords.test.ts`

**Interfaces:**
- Produces: `hashPassword(password: string): Promise<string>`, `verifyPassword(password: string, hash: string): Promise<boolean>`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/passwords.test.ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/passwords";

describe("passwords", () => {
  it("hashes a password and verifies it correctly", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toBe("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/passwords.test.ts`
Expected: FAIL — `Cannot find module '@/lib/passwords'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/passwords.ts
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/passwords.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add password hashing helper"
```

---

### Task 4: Auth.js configuration (Google + Credentials) and registration route

**Files:**
- Create: `lib/auth.ts`, `app/api/auth/[...nextauth]/route.ts`, `app/api/auth/register/route.ts`
- Test: manual verification (OAuth/session flows aren't practical to unit test) — covered by Task 10's manual QA pass; `hashPassword`/`verifyPassword` are already unit-tested in Task 3.

**Interfaces:**
- Consumes: `prisma` from `lib/prisma.ts`; `hashPassword`, `verifyPassword` from `lib/passwords.ts`.
- Produces: `lib/auth.ts` exports `handlers`, `auth`, `signIn`, `signOut` (Auth.js v5 shape). `app/api/auth/register` accepts `POST { email, password, name }`.

- [ ] **Step 1: Write `lib/auth.ts`**

```typescript
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/passwords";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
});
```

- [ ] **Step 2: Write `app/api/auth/[...nextauth]/route.ts`**

```typescript
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 3: Write `app/api/auth/register/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/passwords";

export async function POST(request: Request) {
  const { email, password, name } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, name: name ?? null },
  });

  return NextResponse.json({ id: user.id, email: user.email, name: user.name }, { status: 201 });
}
```

- [ ] **Step 4: Set `AUTH_SECRET` and Google OAuth credentials in `.env`**

Generate a secret with `npx auth secret` (or any random 32+ byte string) and set `AUTH_SECRET`. Create a Google OAuth 2.0 Client ID (Google Cloud Console → APIs & Services → Credentials) with redirect URI `http://localhost:3000/api/auth/callback/google`, and set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.

- [ ] **Step 5: Manual verification**

Run `npm run dev`, `POST` to `http://localhost:3000/api/auth/register` with a test email/password (e.g. via `curl` or a REST client), confirm a `201` and that the user row exists via `npx prisma studio`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: configure Auth.js (Google + Credentials) and registration endpoint"
```

---

### Task 5: Book data types and Google Books client

**Files:**
- Create: `lib/books/types.ts`, `lib/books/googleBooks.ts`
- Test: `tests/lib/books/googleBooks.test.ts`

**Interfaces:**
- Produces: `BookData` interface (used by every book-lookup task hereafter):

```typescript
export interface BookData {
  isbn: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  description: string | null;
  genres: string[];
  pageCount: number | null;
  publishedYear: number | null;
  source: "GOOGLE_BOOKS" | "OPEN_LIBRARY" | "MANUAL";
}
```
- Produces: `fetchFromGoogleBooks(isbn: string): Promise<Partial<BookData> | null>` — `null` means "no result"; a partial object may have missing fields (e.g. no `description`).

- [ ] **Step 1: Write `lib/books/types.ts`**

```typescript
export interface BookData {
  isbn: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  description: string | null;
  genres: string[];
  pageCount: number | null;
  publishedYear: number | null;
  source: "GOOGLE_BOOKS" | "OPEN_LIBRARY" | "MANUAL";
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/lib/books/googleBooks.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchFromGoogleBooks } from "@/lib/books/googleBooks";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchFromGoogleBooks", () => {
  it("maps a successful response into partial BookData", async () => {
    const mockResponse = {
      totalItems: 1,
      items: [
        {
          volumeInfo: {
            title: "The Hobbit",
            authors: ["J.R.R. Tolkien"],
            description: "A hobbit's unexpected journey.",
            categories: ["Fiction", "Fantasy"],
            pageCount: 310,
            publishedDate: "1937-09-21",
            imageLinks: { thumbnail: "http://example.com/cover.jpg" },
          },
        },
      ],
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await fetchFromGoogleBooks("9780618260300");

    expect(result).toEqual({
      title: "The Hobbit",
      authors: ["J.R.R. Tolkien"],
      description: "A hobbit's unexpected journey.",
      genres: ["Fiction", "Fantasy"],
      pageCount: 310,
      publishedYear: 1937,
      coverUrl: "http://example.com/cover.jpg",
      source: "GOOGLE_BOOKS",
    });
  });

  it("returns null when there are no results", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ totalItems: 0 }),
    } as Response);

    const result = await fetchFromGoogleBooks("0000000000000");
    expect(result).toBeNull();
  });

  it("returns null when the request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as Response);
    const result = await fetchFromGoogleBooks("9780618260300");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- tests/lib/books/googleBooks.test.ts`
Expected: FAIL — `Cannot find module '@/lib/books/googleBooks'`

- [ ] **Step 4: Write minimal implementation**

```typescript
// lib/books/googleBooks.ts
import type { BookData } from "@/lib/books/types";

export async function fetchFromGoogleBooks(isbn: string): Promise<Partial<BookData> | null> {
  const response = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`
  );
  if (!response.ok) return null;

  const data = await response.json();
  if (!data.totalItems || !data.items?.length) return null;

  const info = data.items[0].volumeInfo ?? {};
  const publishedYear = info.publishedDate ? parseInt(info.publishedDate.slice(0, 4), 10) : null;

  return {
    title: info.title ?? undefined,
    authors: info.authors ?? [],
    description: info.description ?? null,
    genres: info.categories ?? [],
    pageCount: info.pageCount ?? null,
    publishedYear: Number.isNaN(publishedYear) ? null : publishedYear,
    coverUrl: info.imageLinks?.thumbnail ?? null,
    source: "GOOGLE_BOOKS",
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- tests/lib/books/googleBooks.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add BookData type and Google Books client"
```

---

### Task 6: Open Library client

**Files:**
- Create: `lib/books/openLibrary.ts`
- Test: `tests/lib/books/openLibrary.test.ts`

**Interfaces:**
- Consumes: `BookData` from `lib/books/types.ts`.
- Produces: `fetchFromOpenLibrary(isbn: string): Promise<Partial<BookData> | null>` — same contract as `fetchFromGoogleBooks`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/books/openLibrary.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchFromOpenLibrary } from "@/lib/books/openLibrary";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchFromOpenLibrary", () => {
  it("maps a successful response into partial BookData", async () => {
    const isbn = "9780618260300";
    const mockResponse = {
      [`ISBN:${isbn}`]: {
        title: "The Hobbit",
        authors: [{ name: "J.R.R. Tolkien" }],
        subjects: [{ name: "Fantasy fiction" }],
        number_of_pages: 310,
        publish_date: "1937",
        cover: { medium: "http://example.com/ol-cover.jpg" },
      },
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await fetchFromOpenLibrary(isbn);

    expect(result).toEqual({
      title: "The Hobbit",
      authors: ["J.R.R. Tolkien"],
      description: null,
      genres: ["Fantasy fiction"],
      pageCount: 310,
      publishedYear: 1937,
      coverUrl: "http://example.com/ol-cover.jpg",
      source: "OPEN_LIBRARY",
    });
  });

  it("returns null when the ISBN key is absent", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    const result = await fetchFromOpenLibrary("0000000000000");
    expect(result).toBeNull();
  });

  it("returns null when the request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as Response);
    const result = await fetchFromOpenLibrary("9780618260300");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/books/openLibrary.test.ts`
Expected: FAIL — `Cannot find module '@/lib/books/openLibrary'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/books/openLibrary.ts
import type { BookData } from "@/lib/books/types";

export async function fetchFromOpenLibrary(isbn: string): Promise<Partial<BookData> | null> {
  const response = await fetch(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&jscmd=data&format=json`
  );
  if (!response.ok) return null;

  const data = await response.json();
  const entry = data[`ISBN:${isbn}`];
  if (!entry) return null;

  const publishedYear = entry.publish_date ? parseInt(entry.publish_date.slice(-4), 10) : null;

  return {
    title: entry.title ?? undefined,
    authors: (entry.authors ?? []).map((a: { name: string }) => a.name),
    description: null,
    genres: (entry.subjects ?? []).map((s: { name: string }) => s.name),
    pageCount: entry.number_of_pages ?? null,
    publishedYear: Number.isNaN(publishedYear) ? null : publishedYear,
    coverUrl: entry.cover?.medium ?? entry.cover?.large ?? null,
    source: "OPEN_LIBRARY",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/books/openLibrary.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Open Library client"
```

---

### Task 7: Merge logic for combining Google Books and Open Library results

**Files:**
- Create: `lib/books/mergeBookData.ts`
- Test: `tests/lib/books/mergeBookData.test.ts`

**Interfaces:**
- Consumes: `BookData` type; `Partial<BookData> | null` shape from Task 5/6's clients.
- Produces: `mergeBookData(isbn: string, google: Partial<BookData> | null, openLibrary: Partial<BookData> | null): BookData | null` — used by the lookup route (Task 8). Returns `null` only if both inputs are `null`/have no `title`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/books/mergeBookData.test.ts
import { describe, it, expect } from "vitest";
import { mergeBookData } from "@/lib/books/mergeBookData";

describe("mergeBookData", () => {
  it("returns the Google Books result as-is when it is complete", () => {
    const google = {
      title: "The Hobbit",
      authors: ["J.R.R. Tolkien"],
      description: "A journey.",
      genres: ["Fantasy"],
      pageCount: 310,
      publishedYear: 1937,
      coverUrl: "http://example.com/cover.jpg",
      source: "GOOGLE_BOOKS" as const,
    };

    const result = mergeBookData("9780618260300", google, null);

    expect(result).toEqual({ isbn: "9780618260300", ...google });
  });

  it("fills gaps in Google Books data from Open Library", () => {
    const google = {
      title: "The Hobbit",
      authors: ["J.R.R. Tolkien"],
      description: null,
      genres: [],
      pageCount: null,
      publishedYear: 1937,
      coverUrl: null,
      source: "GOOGLE_BOOKS" as const,
    };
    const openLibrary = {
      title: "The Hobbit",
      authors: ["J.R.R. Tolkien"],
      description: null,
      genres: ["Fantasy fiction"],
      pageCount: 310,
      publishedYear: 1937,
      coverUrl: "http://example.com/ol-cover.jpg",
      source: "OPEN_LIBRARY" as const,
    };

    const result = mergeBookData("9780618260300", google, openLibrary);

    expect(result).toEqual({
      isbn: "9780618260300",
      title: "The Hobbit",
      authors: ["J.R.R. Tolkien"],
      description: null,
      genres: ["Fantasy fiction"],
      pageCount: 310,
      publishedYear: 1937,
      coverUrl: "http://example.com/ol-cover.jpg",
      source: "GOOGLE_BOOKS",
    });
  });

  it("uses Open Library alone when Google Books has no result", () => {
    const openLibrary = {
      title: "The Hobbit",
      authors: ["J.R.R. Tolkien"],
      description: null,
      genres: ["Fantasy fiction"],
      pageCount: 310,
      publishedYear: 1937,
      coverUrl: "http://example.com/ol-cover.jpg",
      source: "OPEN_LIBRARY" as const,
    };

    const result = mergeBookData("9780618260300", null, openLibrary);

    expect(result).toEqual({ isbn: "9780618260300", ...openLibrary });
  });

  it("returns null when neither source has a title", () => {
    const result = mergeBookData("0000000000000", null, null);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/books/mergeBookData.test.ts`
Expected: FAIL — `Cannot find module '@/lib/books/mergeBookData'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/books/mergeBookData.ts
import type { BookData } from "@/lib/books/types";

export function mergeBookData(
  isbn: string,
  google: Partial<BookData> | null,
  openLibrary: Partial<BookData> | null
): BookData | null {
  const primary = google?.title ? google : openLibrary?.title ? openLibrary : null;
  if (!primary) return null;

  const secondary = primary === google ? openLibrary : google;

  return {
    isbn,
    title: primary.title!,
    authors: nonEmpty(primary.authors) ?? nonEmpty(secondary?.authors) ?? [],
    description: primary.description ?? secondary?.description ?? null,
    genres: nonEmpty(primary.genres) ?? nonEmpty(secondary?.genres) ?? [],
    pageCount: primary.pageCount ?? secondary?.pageCount ?? null,
    publishedYear: primary.publishedYear ?? secondary?.publishedYear ?? null,
    coverUrl: primary.coverUrl ?? secondary?.coverUrl ?? null,
    source: primary.source!,
  };
}

function nonEmpty<T>(arr: T[] | undefined): T[] | undefined {
  return arr && arr.length > 0 ? arr : undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/books/mergeBookData.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Google Books / Open Library merge logic"
```

---

### Task 8: Book lookup and manual-entry API routes

**Files:**
- Create: `app/api/books/lookup/route.ts`, `app/api/books/manual/route.ts`

**Interfaces:**
- Consumes: `prisma` (`lib/prisma.ts`), `auth` (`lib/auth.ts`), `fetchFromGoogleBooks`, `fetchFromOpenLibrary`, `mergeBookData`, `BookData`.
- Produces: `GET /api/books/lookup?isbn=...` → `200` with the `Book` row (cached or newly upserted), or `404 { error }` if unresolvable. `POST /api/books/manual` → `201` with the created `Book` row (`source: "MANUAL"`).

- [ ] **Step 1: Write `app/api/books/lookup/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { fetchFromGoogleBooks } from "@/lib/books/googleBooks";
import { fetchFromOpenLibrary } from "@/lib/books/openLibrary";
import { mergeBookData } from "@/lib/books/mergeBookData";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const isbn = searchParams.get("isbn");
  if (!isbn) {
    return NextResponse.json({ error: "isbn query parameter is required" }, { status: 400 });
  }

  const cached = await prisma.book.findUnique({ where: { isbn } });
  if (cached) {
    return NextResponse.json(cached);
  }

  const [google, openLibrary] = await Promise.all([
    fetchFromGoogleBooks(isbn),
    fetchFromOpenLibrary(isbn),
  ]);

  const merged = mergeBookData(isbn, google, openLibrary);
  if (!merged) {
    return NextResponse.json({ error: "No book found for that ISBN" }, { status: 404 });
  }

  const book = await prisma.book.create({
    data: {
      isbn: merged.isbn,
      title: merged.title,
      authors: merged.authors,
      coverUrl: merged.coverUrl,
      description: merged.description,
      genres: merged.genres,
      pageCount: merged.pageCount,
      publishedYear: merged.publishedYear,
      source: merged.source,
      rawResponse: { google, openLibrary },
    },
  });

  return NextResponse.json(book, { status: 201 });
}
```

- [ ] **Step 2: Write `app/api/books/manual/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { isbn, title, authors, description, genres, coverUrl, pageCount, publishedYear } = body;

  if (!isbn || !title) {
    return NextResponse.json({ error: "isbn and title are required" }, { status: 400 });
  }

  const existing = await prisma.book.findUnique({ where: { isbn } });
  if (existing) {
    return NextResponse.json(existing);
  }

  const book = await prisma.book.create({
    data: {
      isbn,
      title,
      authors: authors ?? [],
      description: description ?? null,
      genres: genres ?? [],
      coverUrl: coverUrl ?? null,
      pageCount: pageCount ?? null,
      publishedYear: publishedYear ?? null,
      source: "MANUAL",
    },
  });

  return NextResponse.json(book, { status: 201 });
}
```

- [ ] **Step 3: Manual verification**

With `npm run dev` running and signed in (Task 4), call `GET /api/books/lookup?isbn=9780618260300` twice — first call should hit Google Books/Open Library and create a `Book` row (check via `npx prisma studio`), second call should return the same row without any external calls (add a temporary `console.log` before the external fetches to confirm it's skipped on the second call, then remove it).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add book lookup and manual-entry API routes"
```

---

### Task 9: UserBook (shelf) API routes

**Files:**
- Create: `app/api/user-books/route.ts`, `app/api/user-books/[id]/route.ts`

**Interfaces:**
- Consumes: `prisma`, `auth`.
- Produces: `GET /api/user-books` → `200` with the current user's `UserBook[]` (each including its `book`). `POST /api/user-books { bookId, status }` → `201` upserted `UserBook`. `PATCH /api/user-books/[id] { status?, rating?, notes?, startedAt?, finishedAt? }` → `200` updated `UserBook`; `404` if the row doesn't belong to the current user.

- [ ] **Step 1: Write `app/api/user-books/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userBooks = await prisma.userBook.findMany({
    where: { userId: session.user.id },
    include: { book: true },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(userBooks);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bookId, status } = await request.json();
  if (!bookId || !status) {
    return NextResponse.json({ error: "bookId and status are required" }, { status: 400 });
  }

  const userBook = await prisma.userBook.upsert({
    where: { userId_bookId: { userId: session.user.id, bookId } },
    create: { userId: session.user.id, bookId, status },
    update: { status },
    include: { book: true },
  });

  return NextResponse.json(userBook, { status: 201 });
}
```

- [ ] **Step 2: Write `app/api/user-books/[id]/route.ts`**

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
  const existing = await prisma.userBook.findUnique({ where: { id } });
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { status, rating, notes, startedAt, finishedAt } = await request.json();

  const updated = await prisma.userBook.update({
    where: { id },
    data: {
      ...(status !== undefined && { status }),
      ...(rating !== undefined && { rating }),
      ...(notes !== undefined && { notes }),
      ...(startedAt !== undefined && { startedAt: startedAt ? new Date(startedAt) : null }),
      ...(finishedAt !== undefined && { finishedAt: finishedAt ? new Date(finishedAt) : null }),
    },
    include: { book: true },
  });

  return NextResponse.json(updated);
}
```

- [ ] **Step 3: Manual verification**

`POST /api/user-books` with a `bookId` from Task 8's manual test and `status: "WANT_TO_READ"`, confirm `201` and the row in `npx prisma studio`; `PATCH /api/user-books/{id}` with `{ "status": "READ", "rating": 5 }`, confirm `200` and updated fields.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add UserBook (shelf) API routes"
```

---

### Task 10: MUI theme (moss-green, light/dark) and app shell

**Files:**
- Create: `lib/theme.ts`, `lib/theme-mode-context.tsx`, `app/providers.tsx`, `components/AppHeader.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: `getTheme(mode: "light" | "dark"): Theme` (`lib/theme.ts`). `ThemeModeProvider` + `useThemeMode(): { mode: "light" | "dark"; toggleMode: () => void }` (`lib/theme-mode-context.tsx`). `Providers` default export wrapping `SessionProvider` + `ThemeModeProvider` + MUI `ThemeProvider`/`CssBaseline` (`app/providers.tsx`).

- [ ] **Step 1: Write `lib/theme.ts`**

```typescript
import { createTheme, type Theme } from "@mui/material/styles";

const mossGreen = {
  main: "#4A5D45",
  light: "#7A8F73",
  dark: "#2F3D2B",
};

export function getTheme(mode: "light" | "dark"): Theme {
  return createTheme({
    palette: {
      mode,
      primary: mossGreen,
      background:
        mode === "light"
          ? { default: "#F7F8F4", paper: "#FFFFFF" }
          : { default: "#1B1F19", paper: "#242A22" },
    },
    shape: { borderRadius: 10 },
  });
}
```

- [ ] **Step 2: Write `lib/theme-mode-context.tsx`**

```typescript
"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type Mode = "light" | "dark";

const ThemeModeContext = createContext<{ mode: Mode; toggleMode: () => void } | null>(null);

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem("theme-mode") as Mode | null;
    if (stored === "light" || stored === "dark") {
      setMode(stored);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setMode("dark");
    }
  }, []);

  const value = useMemo(
    () => ({
      mode,
      toggleMode: () => {
        setMode((prev) => {
          const next = prev === "light" ? "dark" : "light";
          window.localStorage.setItem("theme-mode", next);
          return next;
        });
      },
    }),
    [mode]
  );

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode() {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error("useThemeMode must be used within ThemeModeProvider");
  return ctx;
}
```

- [ ] **Step 3: Write `app/providers.tsx`**

```typescript
"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { ThemeModeProvider, useThemeMode } from "@/lib/theme-mode-context";
import { getTheme } from "@/lib/theme";
import type { ReactNode } from "react";

function MuiThemeBridge({ children }: { children: ReactNode }) {
  const { mode } = useThemeMode();
  return (
    <ThemeProvider theme={getTheme(mode)}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeModeProvider>
        <MuiThemeBridge>{children}</MuiThemeBridge>
      </ThemeModeProvider>
    </SessionProvider>
  );
}
```

- [ ] **Step 4: Write `components/AppHeader.tsx`**

```typescript
"use client";

import { AppBar, Toolbar, Typography, IconButton, Button, Box } from "@mui/material";
import { Brightness4, Brightness7 } from "@mui/icons-material";
import { useThemeMode } from "@/lib/theme-mode-context";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";

export default function AppHeader() {
  const { mode, toggleMode } = useThemeMode();
  const { data: session } = useSession();

  return (
    <AppBar position="static" color="primary" enableColorOnDark>
      <Toolbar>
        <Typography variant="h6" component={Link} href="/bookshelf" sx={{ flexGrow: 1, color: "inherit", textDecoration: "none" }}>
          Yggdrasil
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <IconButton onClick={toggleMode} color="inherit" aria-label="toggle dark mode">
            {mode === "dark" ? <Brightness7 /> : <Brightness4 />}
          </IconButton>
          {session?.user && (
            <Button color="inherit" onClick={() => signOut({ callbackUrl: "/login" })}>
              Sign out
            </Button>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
}
```

- [ ] **Step 5: Rewrite `app/layout.tsx`**

```typescript
import type { ReactNode } from "react";
import Providers from "./providers";
import AppHeader from "@/components/AppHeader";

export const metadata = {
  title: "Yggdrasil — Reading Tracker",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AppHeader />
          {children}
        </Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Manual verification**

Run `npm run dev`, load `http://localhost:3000`, confirm the moss-green `AppBar` renders and the dark-mode toggle switches the palette (and persists across a page refresh).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add moss-green MUI theme, dark mode toggle, and app header"
```

---

### Task 11: Login and registration pages

**Files:**
- Create: `app/login/page.tsx`, `app/register/page.tsx`

**Interfaces:**
- Consumes: `signIn` from `next-auth/react` (client-side); `POST /api/auth/register` (Task 4).

- [ ] **Step 1: Write `app/login/page.tsx`**

```typescript
"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Box, Button, TextField, Typography, Divider, Alert, Paper } from "@mui/material";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const result = await signIn("credentials", { email, password, redirect: false, callbackUrl: "/bookshelf" });
    if (result?.error) {
      setError("Invalid email or password");
    } else if (result?.url) {
      window.location.href = result.url;
    }
  }

  return (
    <Box sx={{ maxWidth: 400, mx: "auto", mt: 8 }}>
      <Paper sx={{ p: 4 }}>
        <Typography variant="h5" gutterBottom>Sign in</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Button fullWidth variant="outlined" onClick={() => signIn("google", { callbackUrl: "/bookshelf" })} sx={{ mb: 2 }}>
          Continue with Google
        </Button>
        <Divider sx={{ my: 2 }}>or</Divider>
        <Box component="form" onSubmit={handleCredentialsSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Button type="submit" variant="contained">Sign in</Button>
        </Box>
        <Typography sx={{ mt: 2 }}>
          No account? <Link href="/register">Register</Link>
        </Typography>
      </Paper>
    </Box>
  );
}
```

- [ ] **Step 2: Write `app/register/page.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, TextField, Typography, Alert, Paper } from "@mui/material";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    if (!response.ok) {
      const body = await response.json();
      setError(body.error ?? "Registration failed");
      return;
    }
    router.push("/login");
  }

  return (
    <Box sx={{ maxWidth: 400, mx: "auto", mt: 8 }}>
      <Paper sx={{ p: 4 }}>
        <Typography variant="h5" gutterBottom>Create an account</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Button type="submit" variant="contained">Register</Button>
        </Box>
      </Paper>
    </Box>
  );
}
```

- [ ] **Step 3: Manual verification**

Register a new account via the UI, confirm redirect to `/login`, then sign in with the same email/password and confirm redirect to `/bookshelf` (page added in Task 13). Separately, confirm the "Continue with Google" button starts the Google OAuth flow.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add login and registration pages"
```

---

### Task 12: Barcode scanner and manual-entry UI

**Files:**
- Create: `components/BarcodeScanner.tsx`, `components/ManualBookEntry.tsx`, `app/scan/page.tsx`

**Interfaces:**
- Consumes: `@zxing/browser`'s `BrowserMultiFormatReader`; `GET /api/books/lookup`, `POST /api/books/manual`, `POST /api/user-books`.
- Produces: `BarcodeScanner` accepts `onDecode: (isbn: string) => void` and `onError: (message: string) => void` props. `ManualBookEntry` accepts `onCreated: (book: BookLike) => void` where `BookLike` is the JSON shape returned by the lookup/manual API routes.

- [ ] **Step 1: Write `components/BarcodeScanner.tsx`**

```typescript
"use client";

import { useEffect, useRef } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Box, Alert } from "@mui/material";

export default function BarcodeScanner({
  onDecode,
  onError,
}: {
  onDecode: (isbn: string) => void;
  onError: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let controls: { stop: () => void } | undefined;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result, err) => {
        if (result) {
          controls?.stop();
          onDecode(result.getText());
        }
        // NotFoundException fires continuously while no barcode is in frame; ignore it.
      })
      .then((c) => {
        controls = c;
      })
      .catch(() => {
        onError("Camera access failed. Check permissions or use manual entry below.");
      });

    return () => controls?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box>
      <video ref={videoRef} style={{ width: "100%", borderRadius: 8 }} />
      <Alert severity="info" sx={{ mt: 2 }}>
        Point the camera at the book&apos;s barcode.
      </Alert>
    </Box>
  );
}
```

- [ ] **Step 2: Write `components/ManualBookEntry.tsx`**

```typescript
"use client";

import { useState } from "react";
import { Box, TextField, Button, Typography } from "@mui/material";

interface BookLike {
  id: string;
  title: string;
  authors: string[];
}

export default function ManualBookEntry({ onCreated }: { onCreated: (book: BookLike) => void }) {
  const [isbn, setIsbn] = useState("");
  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleRetypeIsbn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const response = await fetch(`/api/books/lookup?isbn=${encodeURIComponent(isbn)}`);
    if (response.ok) {
      onCreated(await response.json());
      return;
    }
    setError("Still no match for that ISBN — fill in the details below instead.");
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const response = await fetch("/api/books/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isbn: isbn || `manual-${Date.now()}`,
        title,
        authors: authors.split(",").map((a) => a.trim()).filter(Boolean),
      }),
    });
    if (!response.ok) {
      const body = await response.json();
      setError(body.error ?? "Could not save this book");
      return;
    }
    onCreated(await response.json());
  }

  return (
    <Box sx={{ mt: 4, display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography variant="h6">Couldn&apos;t scan it?</Typography>
      {error && <Typography color="error">{error}</Typography>}
      <Box component="form" onSubmit={handleRetypeIsbn} sx={{ display: "flex", gap: 2 }}>
        <TextField label="Type the ISBN" value={isbn} onChange={(e) => setIsbn(e.target.value)} size="small" />
        <Button type="submit" variant="outlined">Look up</Button>
      </Box>
      <Typography variant="body2">Or enter the details by hand:</Typography>
      <Box component="form" onSubmit={handleManualSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <TextField label="Authors (comma-separated)" value={authors} onChange={(e) => setAuthors(e.target.value)} />
        <Button type="submit" variant="contained">Save book</Button>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 3: Write `app/scan/page.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Typography, Alert, CircularProgress } from "@mui/material";
import BarcodeScanner from "@/components/BarcodeScanner";
import ManualBookEntry from "@/components/ManualBookEntry";

interface BookLike {
  id: string;
  title: string;
}

export default function ScanPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"scanning" | "looking-up" | "not-found" | "error">("scanning");
  const [message, setMessage] = useState<string | null>(null);

  async function addToShelfAndRedirect(book: BookLike) {
    await fetch("/api/user-books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: book.id, status: "WANT_TO_READ" }),
    });
    router.push(`/books/${book.id}`);
  }

  async function handleDecode(isbn: string) {
    setStatus("looking-up");
    const response = await fetch(`/api/books/lookup?isbn=${encodeURIComponent(isbn)}`);
    if (response.ok) {
      await addToShelfAndRedirect(await response.json());
      return;
    }
    setStatus("not-found");
    setMessage("No book found for that barcode.");
  }

  return (
    <Box sx={{ maxWidth: 480, mx: "auto", mt: 4 }}>
      <Typography variant="h5" gutterBottom>Scan a book</Typography>
      {status === "scanning" && (
        <BarcodeScanner
          onDecode={handleDecode}
          onError={(msg) => {
            setStatus("error");
            setMessage(msg);
          }}
        />
      )}
      {status === "looking-up" && <CircularProgress />}
      {(status === "not-found" || status === "error") && (
        <>
          <Alert severity="warning" sx={{ mt: 2 }}>{message}</Alert>
          <ManualBookEntry onCreated={addToShelfAndRedirect} />
        </>
      )}
    </Box>
  );
}
```

- [ ] **Step 4: Manual verification**

On a device/browser with camera access, open `/scan`, allow camera permission, hold up a book barcode, confirm it decodes and redirects to the book's detail page with it added as "Want to Read." Then test the fallback: deny camera permission (or cover the camera) and confirm the manual entry form appears and successfully saves a book.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add barcode scanner and manual entry fallback UI"
```

---

### Task 13: Bookshelf view and book detail page

**Files:**
- Create: `components/BookCard.tsx`, `app/bookshelf/page.tsx`, `app/books/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/user-books`, `PATCH /api/user-books/[id]`.
- Produces: `/bookshelf` (tabs for `WANT_TO_READ`/`READING`/`READ`, grid of `BookCard`), `/books/[id]` (detail + edit form).

- [ ] **Step 1: Write `components/BookCard.tsx`**

```typescript
"use client";

import { Card, CardActionArea, CardMedia, CardContent, Typography, Rating } from "@mui/material";
import Link from "next/link";

interface UserBookLike {
  id: string;
  rating: number | null;
  book: { id: string; title: string; authors: string[]; coverUrl: string | null };
}

export default function BookCard({ userBook }: { userBook: UserBookLike }) {
  return (
    <Card sx={{ width: 160 }}>
      <CardActionArea component={Link} href={`/books/${userBook.book.id}`}>
        <CardMedia
          component="img"
          image={userBook.book.coverUrl ?? "/book-placeholder.svg"}
          alt={userBook.book.title}
          sx={{ height: 220, objectFit: "cover" }}
        />
        <CardContent>
          <Typography variant="subtitle2" noWrap>{userBook.book.title}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {userBook.book.authors.join(", ")}
          </Typography>
          {userBook.rating != null && <Rating value={userBook.rating} readOnly size="small" />}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
```

- [ ] **Step 2: Write `app/bookshelf/page.tsx`**

```typescript
"use client";

import { useEffect, useState } from "react";
import { Box, Tabs, Tab, CircularProgress } from "@mui/material";
import BookCard from "@/components/BookCard";

interface UserBook {
  id: string;
  status: "WANT_TO_READ" | "READING" | "READ";
  rating: number | null;
  book: { id: string; title: string; authors: string[]; coverUrl: string | null };
}

const TABS: { label: string; status: UserBook["status"] }[] = [
  { label: "Want to Read", status: "WANT_TO_READ" },
  { label: "Reading", status: "READING" },
  { label: "Read", status: "READ" },
];

export default function BookshelfPage() {
  const [userBooks, setUserBooks] = useState<UserBook[] | null>(null);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    fetch("/api/user-books")
      .then((res) => res.json())
      .then(setUserBooks);
  }, []);

  if (!userBooks) return <CircularProgress sx={{ m: 4 }} />;

  const activeStatus = TABS[tab].status;
  const filtered = userBooks.filter((ub) => ub.status === activeStatus);

  return (
    <Box sx={{ p: 4 }}>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        {TABS.map((t) => (
          <Tab key={t.status} label={t.label} />
        ))}
      </Tabs>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
        {filtered.map((ub) => (
          <BookCard key={ub.id} userBook={ub} />
        ))}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 3: Write `app/books/[id]/page.tsx`**

```typescript
"use client";

import { useEffect, useState, use } from "react";
import {
  Box,
  Typography,
  Rating,
  TextField,
  Select,
  MenuItem,
  Button,
  Chip,
  CircularProgress,
  Stack,
} from "@mui/material";

interface UserBook {
  id: string;
  status: "WANT_TO_READ" | "READING" | "READ";
  rating: number | null;
  notes: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  book: {
    id: string;
    title: string;
    authors: string[];
    coverUrl: string | null;
    description: string | null;
    genres: string[];
  };
}

export default function BookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [userBook, setUserBook] = useState<UserBook | null>(null);

  useEffect(() => {
    fetch("/api/user-books")
      .then((res) => res.json())
      .then((all: UserBook[]) => setUserBook(all.find((ub) => ub.book.id === id) ?? null));
  }, [id]);

  async function updateField(data: Partial<Pick<UserBook, "status" | "rating" | "notes" | "startedAt" | "finishedAt">>) {
    if (!userBook) return;
    const response = await fetch(`/api/user-books/${userBook.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setUserBook(await response.json());
  }

  if (!userBook) return <CircularProgress sx={{ m: 4 }} />;

  const { book } = userBook;

  return (
    <Box sx={{ maxWidth: 700, mx: "auto", p: 4, display: "flex", gap: 4 }}>
      {book.coverUrl && (
        <Box component="img" src={book.coverUrl} alt={book.title} sx={{ width: 200, borderRadius: 2 }} />
      )}
      <Box sx={{ flex: 1 }}>
        <Typography variant="h4">{book.title}</Typography>
        <Typography variant="subtitle1" color="text.secondary" gutterBottom>
          {book.authors.join(", ")}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ my: 1 }}>
          {book.genres.map((g) => (
            <Chip key={g} label={g} size="small" />
          ))}
        </Stack>
        <Typography variant="body2" sx={{ mb: 2 }}>{book.description}</Typography>

        <Select value={userBook.status} onChange={(e) => updateField({ status: e.target.value as UserBook["status"] })} sx={{ mb: 2 }}>
          <MenuItem value="WANT_TO_READ">Want to Read</MenuItem>
          <MenuItem value="READING">Reading</MenuItem>
          <MenuItem value="READ">Read</MenuItem>
        </Select>

        {userBook.status === "READ" && (
          <Rating
            value={userBook.rating ?? 0}
            onChange={(_, value) => updateField({ rating: value })}
            sx={{ display: "block", mb: 2 }}
          />
        )}

        <TextField
          label="Notes"
          multiline
          minRows={3}
          fullWidth
          defaultValue={userBook.notes ?? ""}
          onBlur={(e) => updateField({ notes: e.target.value })}
          sx={{ mb: 2 }}
        />

        <Button variant="text" onClick={() => updateField({ finishedAt: new Date().toISOString() })}>
          Mark finished today
        </Button>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Manual verification**

Navigate to `/bookshelf`, confirm books added via `/scan` appear under "Want to Read," click into a book's detail page, change its status to "Read," set a rating, add notes (confirm they save on blur), and confirm the change is reflected back on `/bookshelf` under the "Read" tab after navigating back.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add bookshelf view and book detail/edit page"
```

---

### Task 14: Route protection proxy

**Files:**
- Create: `proxy.ts`

**Interfaces:**
- Consumes: `auth` from `lib/auth.ts`.
- Produces: unauthenticated requests to `/scan`, `/bookshelf`, `/books/**` redirect to `/login`.

Note: Next.js 16 deprecated the `middleware.ts`/`middleware` export convention in
favor of `proxy.ts`/`proxy` (see `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`,
"`middleware` to `proxy`"); this task uses the current convention.

- [ ] **Step 1: Write `proxy.ts`**

```typescript
export { auth as proxy } from "@/lib/auth";

export const config = {
  matcher: ["/scan/:path*", "/bookshelf/:path*", "/books/:path*"],
};
```

- [ ] **Step 2: Manual verification**

Sign out, then navigate directly to `http://localhost:3000/bookshelf` and confirm a redirect to `/login`. Sign back in and confirm `/bookshelf` loads normally.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: protect authenticated routes with middleware"
```

---

## Post-plan check

Run the full unit test suite once more before considering Phase 1 done:

```bash
npm run test
```

Expected: all tests across `tests/lib/passwords.test.ts`, `tests/lib/books/googleBooks.test.ts`, `tests/lib/books/openLibrary.test.ts`, `tests/lib/books/mergeBookData.test.ts` pass.
