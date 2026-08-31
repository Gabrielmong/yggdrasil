# Genre & Tag Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `Book.genres`/`Book.tags` free-text `String[]` columns with normalized `Genre`/`Tag` entities (many-to-many via `BookGenre`/`BookTag`), backfilled from existing data via one LLM clustering pass, kept from re-fragmenting going forward via an ongoing resolver, with autocomplete editing UI — fixing the genre-noise root cause the comparison charts' top-12 cap only band-aided.

**Architecture:** New `Genre`/`Tag`/`BookGenre`/`BookTag` tables, added additively (Task 1) alongside the existing `genres`/`tags` columns. A shared resolver (`lib/genres/resolveOrCreate.ts`) and a shared response serializer (`lib/books/serializeBook.ts`) are the two pieces every other task builds on. Every route/script that reads or writes genres/tags migrates one at a time to the new tables; the old columns are dropped only in the final, explicitly-confirmed task once everything else is verified.

**Tech Stack:** Next.js App Router, Prisma 7, `@anthropic-ai/sdk` (already a dependency, already used in `scripts/backfill-books.ts`), MUI v9 (`Autocomplete`, new usage in this codebase), Vitest.

**Spec:** [docs/superpowers/specs/2026-08-31-genre-tag-normalization-design.md](../specs/2026-08-31-genre-tag-normalization-design.md)

## Global Constraints

- Every API route: `const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });`
- Prisma access via the singleton `prisma` from `@/lib/prisma`.
- The new Prisma relation fields on `Book` are named `genreLinks`/`tagLinks` (NOT `genres`/`tags`) — the old scalar columns already own those names until Task 12 drops them. `genreLinks`/`tagLinks` are the **permanent** internal relation names (no rename planned after cutover, to avoid extra churn in the already-risky final task); the public API/JSON shape stays `genres: string[]`/`tags: string[]` via the serializer, so no client code needs to know the internal name changed.
- `resolveOrCreateGenre`/`resolveOrCreateTag` (Task 2) never block on an LLM outage — exact-match first, fuzzy-match via Claude only on a miss, verbatim-create as the final fallback.
- Anthropic usage follows `scripts/backfill-books.ts`'s existing pattern exactly: `process.env.ANTHROPIC_API_KEY ? new Anthropic() : null`, model from `process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001"`, guarded JSON parsing of the response text (strip a possible ` ```json ` fence, `JSON.parse` in a try/catch).
- Pure-logic unit tests live under `tests/lib/**/*.test.ts`, matching existing conventions (`tests/lib/books/*.test.ts`, `tests/lib/googleIdToken.test.ts`'s `vi.hoisted`/`vi.mock` pattern for mocking an SDK client).
- Client pages/forms follow existing patterns: fetch-in-`useEffect`, 401 → redirect, error → `Typography color="error"`.
- Migrations: `npx prisma migrate dev --name <name>`.

---

### Task 1: Genre/Tag/BookGenre/BookTag schema (additive)

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `Genre` (`id`, `name` unique), `Tag` (`id`, `name` unique), `BookGenre` (`bookId`, `genreId`, composite PK — Prisma generates the `bookId_genreId` where-unique input), `BookTag` (`bookId`, `tagId`, composite PK — `bookId_tagId`), and `Book.genreLinks`/`Book.tagLinks` relations. The old `Book.genres`/`Book.tags` `String[]` columns are untouched — every later task through Task 11 reads/writes the new tables, leaving the old columns to go stale until Task 12 drops them.

- [ ] **Step 1: Add the new models**

Add to `prisma/schema.prisma` (after the `UserBook` model, at the end of the file):

```prisma
model Genre {
  id   String @id @default(cuid())
  name String @unique

  books BookGenre[]
}

model Tag {
  id   String @id @default(cuid())
  name String @unique

  books BookTag[]
}

model BookGenre {
  bookId  String
  genreId String

  book  Book  @relation(fields: [bookId], references: [id], onDelete: Cascade)
  genre Genre @relation(fields: [genreId], references: [id], onDelete: Cascade)

  @@id([bookId, genreId])
}

model BookTag {
  bookId String
  tagId  String

  book Book @relation(fields: [bookId], references: [id], onDelete: Cascade)
  tag  Tag  @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([bookId, tagId])
}
```

- [ ] **Step 2: Add the relations to `Book`**

In the `Book` model, add two lines to its relations block (after `edits BookEdit[]`) — do NOT touch the existing `genres`/`tags` scalar columns:

```prisma
  userBooks  UserBook[]
  edits      BookEdit[]
  genreLinks BookGenre[]
  tagLinks   BookTag[]
```

- [ ] **Step 3: Migrate**

Run: `npx prisma migrate dev --name add_genre_tag_entities`
Expected: new migration folder created and applied; `npx prisma generate` runs automatically.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add Genre/Tag entities and BookGenre/BookTag join tables"
```

---

### Task 2: `resolveOrCreateGenre`/`resolveOrCreateTag` + tests

**Files:**
- Create: `lib/genres/resolveOrCreate.ts`
- Test: `tests/lib/genres/resolveOrCreate.test.ts`

**Interfaces:**
- Produces: `resolveOrCreateGenre(rawName: string): Promise<{ id: string; name: string }>`, `resolveOrCreateTag(rawName: string): Promise<{ id: string; name: string }>`, and the exported pure helper `parseFuzzyMatchResponse(text: string, candidateNames: string[]): string | null` — consumed by Tasks 5, 7, 10.

- [ ] **Step 1: Write the failing tests for the pure parser**

Create `tests/lib/genres/resolveOrCreate.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseFuzzyMatchResponse } from "@/lib/genres/resolveOrCreate";

describe("parseFuzzyMatchResponse", () => {
  it("returns the matched candidate when Claude reports a match", () => {
    expect(parseFuzzyMatchResponse('{"match": "Philosophy"}', ["Philosophy", "Fiction"])).toBe("Philosophy");
  });

  it("returns null when Claude reports no match", () => {
    expect(parseFuzzyMatchResponse('{"match": null}', ["Philosophy", "Fiction"])).toBeNull();
  });

  it("strips a markdown code fence before parsing", () => {
    expect(parseFuzzyMatchResponse('```json\n{"match": "Fiction"}\n```', ["Philosophy", "Fiction"])).toBe("Fiction");
  });

  it("returns null for malformed JSON", () => {
    expect(parseFuzzyMatchResponse("not json", ["Philosophy"])).toBeNull();
  });

  it("returns null when the reported match isn't actually in the candidate list (guards against hallucination)", () => {
    expect(parseFuzzyMatchResponse('{"match": "Made Up Genre"}', ["Philosophy", "Fiction"])).toBeNull();
  });

  it("returns null when match is present but not a string", () => {
    expect(parseFuzzyMatchResponse('{"match": 42}', ["Philosophy"])).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/genres/resolveOrCreate.test.ts`
Expected: FAIL with a module-not-found error for `@/lib/genres/resolveOrCreate`.

- [ ] **Step 3: Write the implementation**

Create `lib/genres/resolveOrCreate.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

/** Parses Claude's fuzzy-match response for one raw genre/tag name against
 * a list of existing canonical names. Returns the matched candidate name
 * — validated against the actual candidate list, guarding against a
 * hallucinated name — or null if Claude reported no match, the response
 * was malformed, or the reported match wasn't an actual candidate. Pure,
 * no I/O. */
export function parseFuzzyMatchResponse(text: string, candidateNames: string[]): string | null {
  const cleaned = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const match = (parsed as { match?: unknown }).match;
  if (typeof match !== "string") return null;
  return candidateNames.includes(match) ? match : null;
}

async function fuzzyMatch(rawName: string, candidateNames: string[]): Promise<string | null> {
  if (!anthropic || candidateNames.length === 0) return null;
  try {
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: [
            "Does this new label mean the same thing as one of these existing canonical labels (accounting for translations, synonyms, and near-duplicates)?",
            `New label: ${rawName}`,
            `Existing labels: ${candidateNames.join(", ")}`,
            'Return only valid JSON: {"match": string | null} — the exact existing label it matches, or null if it is genuinely a new, distinct concept.',
          ].join("\n"),
        },
      ],
    });
    const text = response.content.find((block) => block.type === "text");
    return text?.type === "text" ? parseFuzzyMatchResponse(text.text, candidateNames) : null;
  } catch {
    return null;
  }
}

/** Resolves a raw genre/tag string to a canonical Genre/Tag row: exact
 * (case-insensitive) match first; on a miss, an LLM fuzzy-match against
 * the existing canonical names; on no match (or no LLM configured),
 * creates a new row verbatim from the trimmed input. Handles the
 * create-race case (two callers resolving the same brand-new name at
 * once) by re-fetching on a unique-constraint failure. */
export async function resolveOrCreateGenre(rawName: string): Promise<{ id: string; name: string }> {
  const trimmed = rawName.trim();

  const existing = await prisma.genre.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" } } });
  if (existing) return existing;

  const candidates = await prisma.genre.findMany({ select: { id: true, name: true }, take: 500 });
  const matchedName = await fuzzyMatch(trimmed, candidates.map((c) => c.name));
  if (matchedName) {
    const matched = candidates.find((c) => c.name === matchedName);
    if (matched) return matched;
  }

  try {
    return await prisma.genre.create({ data: { name: trimmed } });
  } catch {
    const created = await prisma.genre.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" } } });
    if (created) return created;
    throw new Error(`Failed to resolve or create genre: ${rawName}`);
  }
}

/** Same as resolveOrCreateGenre, for Tag. */
export async function resolveOrCreateTag(rawName: string): Promise<{ id: string; name: string }> {
  const trimmed = rawName.trim();

  const existing = await prisma.tag.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" } } });
  if (existing) return existing;

  const candidates = await prisma.tag.findMany({ select: { id: true, name: true }, take: 500 });
  const matchedName = await fuzzyMatch(trimmed, candidates.map((c) => c.name));
  if (matchedName) {
    const matched = candidates.find((c) => c.name === matchedName);
    if (matched) return matched;
  }

  try {
    return await prisma.tag.create({ data: { name: trimmed } });
  } catch {
    const created = await prisma.tag.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" } } });
    if (created) return created;
    throw new Error(`Failed to resolve or create tag: ${rawName}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/genres/resolveOrCreate.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Verify the rest of the file**

Run: `npx tsc --noEmit && npx eslint lib/genres/resolveOrCreate.ts`
Expected: no errors. (`resolveOrCreateGenre`/`resolveOrCreateTag` themselves are DB-touching orchestration, not unit-tested — manual verification via the tasks that call them, matching this codebase's existing convention of not testing route/DB-calling code.)

- [ ] **Step 6: Commit**

```bash
git add lib/genres/resolveOrCreate.ts tests/lib/genres/resolveOrCreate.test.ts
git commit -m "feat: add resolveOrCreateGenre/Tag resolver"
```

---

### Task 3: `serializeBookTaxonomy` shared serializer + tests

**Files:**
- Create: `lib/books/serializeBook.ts`
- Test: `tests/lib/books/serializeBook.test.ts`

**Interfaces:**
- Produces: `BOOK_TAXONOMY_INCLUDE` (a Prisma `include` fragment for `genreLinks`/`tagLinks`), `serializeBookTaxonomy(book)` — flattens `genreLinks`/`tagLinks` into `genres: string[]`/`tags: string[]`, keeping every other field as-is. Consumed by Tasks 5, 7, 9.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/books/serializeBook.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { serializeBookTaxonomy } from "@/lib/books/serializeBook";

describe("serializeBookTaxonomy", () => {
  it("flattens genreLinks/tagLinks into name arrays, preserving other fields", () => {
    const book = {
      id: "book-1",
      title: "The Myth of Sisyphus",
      genreLinks: [{ genre: { name: "Philosophy" } }, { genre: { name: "Essays" } }],
      tagLinks: [{ tag: { name: "existentialism" } }],
    };

    expect(serializeBookTaxonomy(book)).toEqual({
      id: "book-1",
      title: "The Myth of Sisyphus",
      genres: ["Philosophy", "Essays"],
      tags: ["existentialism"],
    });
  });

  it("returns empty arrays for a book with no genres or tags", () => {
    const book = { id: "book-2", title: "Untagged", genreLinks: [], tagLinks: [] };

    expect(serializeBookTaxonomy(book)).toEqual({ id: "book-2", title: "Untagged", genres: [], tags: [] });
  });

  it("does not mutate the input object", () => {
    const book = { id: "book-3", genreLinks: [{ genre: { name: "Fiction" } }], tagLinks: [] };
    serializeBookTaxonomy(book);
    expect(book).toHaveProperty("genreLinks");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/books/serializeBook.test.ts`
Expected: FAIL with a module-not-found error for `@/lib/books/serializeBook`.

- [ ] **Step 3: Write the implementation**

Create `lib/books/serializeBook.ts`:

```typescript
/** Prisma `include` fragment for fetching a Book's normalized genre/tag
 * relations, ready for serializeBookTaxonomy. Every route that returns a
 * Book (or a UserBook with a nested `book`) to a client uses this. */
export const BOOK_TAXONOMY_INCLUDE = {
  genreLinks: { select: { genre: { select: { name: true } } } },
  tagLinks: { select: { tag: { select: { name: true } } } },
} as const;

interface BookTaxonomyShape {
  genreLinks: { genre: { name: string } }[];
  tagLinks: { tag: { name: string } }[];
}

/** Flattens a Book's genreLinks/tagLinks relations (fetched via
 * BOOK_TAXONOMY_INCLUDE) into plain `genres`/`tags` name arrays — the
 * public API shape every existing client already expects, unchanged by
 * the underlying migration to normalized entities. If the fetched row
 * still carries the old (now-unused) `genres`/`tags` scalar columns
 * too, those are silently replaced by the derived values below — the
 * explicit properties in the returned object literal win over whatever
 * `...rest` carried in. */
export function serializeBookTaxonomy<T extends BookTaxonomyShape>(
  book: T
): Omit<T, "genreLinks" | "tagLinks"> & { genres: string[]; tags: string[] } {
  const { genreLinks, tagLinks, ...rest } = book;
  return {
    ...rest,
    genres: genreLinks.map((link) => link.genre.name),
    tags: tagLinks.map((link) => link.tag.name),
  } as Omit<T, "genreLinks" | "tagLinks"> & { genres: string[]; tags: string[] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/books/serializeBook.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npx eslint lib/books/serializeBook.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/books/serializeBook.ts tests/lib/books/serializeBook.test.ts
git commit -m "feat: add serializeBookTaxonomy shared response serializer"
```

---

### Task 4: One-time clustering backfill (`scripts/backfill-genres-tags.ts`)

**Files:**
- Create: `scripts/backfill-genres-tags.ts`
- Test: `tests/scripts/backfill-genres-tags.test.ts`

**Interfaces:**
- Produces: the exported pure helper `parseClusterResponse(text: string, rawValues: string[]): Cluster[]` (tested), and a runnable script (`main()`) that populates `Genre`/`Tag`/`BookGenre`/`BookTag` from every existing `Book.genres`/`Book.tags` value.

- [ ] **Step 1: Write the failing tests for the pure parser**

Create `tests/scripts/backfill-genres-tags.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseClusterResponse } from "../../scripts/backfill-genres-tags";

describe("parseClusterResponse", () => {
  it("returns the parsed clusters when every raw value is covered", () => {
    const result = parseClusterResponse(
      '{"clusters": [{"canonical": "Philosophy", "raw": ["Filosofia", "Philosophy"]}, {"canonical": "Fiction", "raw": ["Fiction"]}]}',
      ["Filosofia", "Philosophy", "Fiction"]
    );
    expect(result).toEqual([
      { canonical: "Philosophy", raw: ["Filosofia", "Philosophy"] },
      { canonical: "Fiction", raw: ["Fiction"] },
    ]);
  });

  it("gives an uncovered raw value its own canonical entry", () => {
    const result = parseClusterResponse(
      '{"clusters": [{"canonical": "Fiction", "raw": ["Fiction"]}]}',
      ["Fiction", "Orphaned Genre"]
    );
    expect(result).toEqual([
      { canonical: "Fiction", raw: ["Fiction"] },
      { canonical: "Orphaned Genre", raw: ["Orphaned Genre"] },
    ]);
  });

  it("falls back to one cluster per raw value on malformed JSON", () => {
    const result = parseClusterResponse("not json", ["Fiction", "Philosophy"]);
    expect(result).toEqual([
      { canonical: "Fiction", raw: ["Fiction"] },
      { canonical: "Philosophy", raw: ["Philosophy"] },
    ]);
  });

  it("falls back to one cluster per raw value when the clusters field is missing", () => {
    const result = parseClusterResponse('{"oops": true}', ["Fiction"]);
    expect(result).toEqual([{ canonical: "Fiction", raw: ["Fiction"] }]);
  });

  it("ignores a raw entry in the response that was never in the input list (guards against hallucination)", () => {
    const result = parseClusterResponse(
      '{"clusters": [{"canonical": "Fiction", "raw": ["Fiction", "Made Up Value"]}]}',
      ["Fiction"]
    );
    expect(result).toEqual([{ canonical: "Fiction", raw: ["Fiction"] }]);
  });

  it("strips a markdown code fence before parsing", () => {
    const result = parseClusterResponse('```json\n{"clusters": [{"canonical": "Fiction", "raw": ["Fiction"]}]}\n```', ["Fiction"]);
    expect(result).toEqual([{ canonical: "Fiction", raw: ["Fiction"] }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/scripts/backfill-genres-tags.test.ts`
Expected: FAIL with a module-not-found error for `../../scripts/backfill-genres-tags`.

- [ ] **Step 3: Write the implementation**

Create `scripts/backfill-genres-tags.ts`:

```typescript
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

const dryRun = process.env.BOOK_BACKFILL_DRY_RUN === "true";
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

export interface Cluster {
  canonical: string;
  raw: string[];
}

/** Parses Claude's clustering response into a validated cluster list.
 * Falls back to one cluster per raw value (safe default — never drops a
 * label) on malformed JSON, a missing/invalid `clusters` field, or a
 * raw value the response never covered. Ignores any reported raw value
 * that wasn't actually in the input list (guards against
 * hallucination). Pure, no I/O. */
export function parseClusterResponse(text: string, rawValues: string[]): Cluster[] {
  const cleaned = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return rawValues.map((raw) => ({ canonical: raw, raw: [raw] }));
  }

  const clustersField = (parsed as { clusters?: unknown } | null)?.clusters;
  if (!Array.isArray(clustersField)) {
    return rawValues.map((raw) => ({ canonical: raw, raw: [raw] }));
  }

  const valid: Cluster[] = [];
  const covered = new Set<string>();
  for (const entry of clustersField) {
    if (!entry || typeof entry !== "object") continue;
    const canonical = (entry as Record<string, unknown>).canonical;
    const raw = (entry as Record<string, unknown>).raw;
    if (typeof canonical !== "string" || !Array.isArray(raw)) continue;

    const rawStrings = raw.filter((r): r is string => typeof r === "string" && rawValues.includes(r));
    if (rawStrings.length === 0) continue;

    valid.push({ canonical: canonical.trim(), raw: rawStrings });
    rawStrings.forEach((r) => covered.add(r));
  }

  for (const raw of rawValues) {
    if (!covered.has(raw)) valid.push({ canonical: raw, raw: [raw] });
  }
  return valid;
}

async function clusterValues(rawValues: string[], kind: "genre" | "tag"): Promise<Cluster[]> {
  if (rawValues.length === 0) return [];
  if (!anthropic) return rawValues.map((raw) => ({ canonical: raw, raw: [raw] }));

  try {
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            `Cluster these raw book ${kind} labels into canonical categories. Merge translations, case variants, and near-synonyms into one canonical label each; keep genuinely distinct concepts separate.`,
            `Labels:\n${rawValues.map((v) => `- ${v}`).join("\n")}`,
            'Return only valid JSON: {"clusters": [{"canonical": string, "raw": string[]}]} — every input label must appear in exactly one cluster\'s "raw" array.',
          ].join("\n\n"),
        },
      ],
    });
    const text = response.content.find((block) => block.type === "text");
    if (text?.type !== "text") return rawValues.map((raw) => ({ canonical: raw, raw: [raw] }));
    return parseClusterResponse(text.text, rawValues);
  } catch (error) {
    console.error(`[backfill-genres-tags] clustering failed for ${kind}, falling back to 1:1`, error);
    return rawValues.map((raw) => ({ canonical: raw, raw: [raw] }));
  }
}

async function backfillKind(kind: "genre" | "tag") {
  const books = await prisma.book.findMany({ select: { id: true, genres: true, tags: true } });
  const rawValues = [
    ...new Set(books.flatMap((b) => (kind === "genre" ? b.genres : b.tags).map((v) => v.trim()).filter(Boolean))),
  ];

  console.log(`[${kind}] ${rawValues.length} distinct raw values across ${books.length} books`);
  const clusters = await clusterValues(rawValues, kind);
  console.log(`[${kind}] clustered into ${clusters.length} canonical entities`);

  const rawToCanonical = new Map<string, string>();
  for (const cluster of clusters) {
    for (const raw of cluster.raw) rawToCanonical.set(raw, cluster.canonical);
  }

  const canonicalIds = new Map<string, string>();
  if (!dryRun) {
    for (const cluster of clusters) {
      const client = kind === "genre" ? prisma.genre : prisma.tag;
      const existing = await client.findFirst({ where: { name: { equals: cluster.canonical, mode: "insensitive" } } });
      const row = existing ?? (await client.create({ data: { name: cluster.canonical } }));
      canonicalIds.set(cluster.canonical, row.id);
    }
  }

  let linked = 0;
  for (const book of books) {
    const rawList = kind === "genre" ? book.genres : book.tags;
    const canonicalNames = [
      ...new Set(rawList.map((v) => rawToCanonical.get(v.trim())).filter((v): v is string => Boolean(v))),
    ];
    for (const name of canonicalNames) {
      const entityId = canonicalIds.get(name);
      if (!entityId || dryRun) continue;
      if (kind === "genre") {
        await prisma.bookGenre.upsert({
          where: { bookId_genreId: { bookId: book.id, genreId: entityId } },
          create: { bookId: book.id, genreId: entityId },
          update: {},
        });
      } else {
        await prisma.bookTag.upsert({
          where: { bookId_tagId: { bookId: book.id, tagId: entityId } },
          create: { bookId: book.id, tagId: entityId },
          update: {},
        });
      }
      linked += 1;
    }
  }
  console.log(`[${kind}] linked ${linked} book-${kind} relations${dryRun ? " (dry run, nothing written)" : ""}`);
}

async function main() {
  await backfillKind("genre");
  await backfillKind("tag");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/scripts/backfill-genres-tags.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npx eslint scripts/backfill-genres-tags.ts`
Expected: no errors.

- [ ] **Step 6: Run the backfill against the dev database, dry run first**

Run: `BOOK_BACKFILL_DRY_RUN=true npx tsx scripts/backfill-genres-tags.ts`
Expected: console output showing distinct-value counts and cluster counts for both genre and tag, "(dry run, nothing written)" on both lines, exit code 0. Read the output for anything that looks wrong (a cluster merging two clearly-different concepts) before proceeding — if something looks off, it's a prompt-tuning issue to flag in your report, not something to silently ship.

- [ ] **Step 7: Run it for real**

Run: `npx tsx scripts/backfill-genres-tags.ts`
Expected: same output shape, without the dry-run suffix, actual `Genre`/`Tag`/`BookGenre`/`BookTag` rows created. Spot-check with `npx prisma studio` or a quick query that a few books now have sensible `BookGenre`/`BookTag` rows.

- [ ] **Step 8: Commit**

```bash
git add scripts/backfill-genres-tags.ts tests/scripts/backfill-genres-tags.test.ts
git commit -m "feat: add one-time genre/tag clustering backfill script"
```

---

### Task 5: Book creation routes resolve genres on create

**Files:**
- Modify: `app/api/books/lookup/route.ts`
- Modify: `app/api/books/manual/route.ts`

**Interfaces:**
- Consumes: `resolveOrCreateGenre`/`resolveOrCreateTag` (Task 2), `BOOK_TAXONOMY_INCLUDE`/`serializeBookTaxonomy` (Task 3).

- [ ] **Step 1: `app/api/books/lookup/route.ts`**

Replace the `prisma.book.create` call and its `return` with:

```typescript
  const genreEntities = await Promise.all(merged.genres.map((name) => resolveOrCreateGenre(name)));

  const book = await prisma.book.create({
    data: {
      isbn: merged.isbn,
      title: merged.title,
      authors: merged.authors,
      coverUrl: merged.coverUrl,
      description: merged.description,
      pageCount: merged.pageCount,
      publishedYear: merged.publishedYear,
      source: merged.source,
      rawResponse: { google, openLibrary, hardcover },
      genreLinks: { create: genreEntities.map((g) => ({ genreId: g.id })) },
    },
    include: BOOK_TAXONOMY_INCLUDE,
  });

  return NextResponse.json(serializeBookTaxonomy(book), { status: 201 });
```

Note the old `genres: merged.genres` line is removed entirely (not replaced with an empty value) — the column keeps its Postgres array default (`{}`) since it's no longer written by this route. Add the two new imports at the top of the file:

```typescript
import { resolveOrCreateGenre } from "@/lib/genres/resolveOrCreate";
import { BOOK_TAXONOMY_INCLUDE, serializeBookTaxonomy } from "@/lib/books/serializeBook";
```

The `cached` early-return path (`if (cached) { return NextResponse.json(cached); }`) also needs updating — a cache hit currently returns the raw `Book` row with the old `genres`/`tags` columns (now stale). Change it to fetch with taxonomy and serialize:

```typescript
  const cached = await prisma.book.findUnique({ where: { isbn: lookupKey }, include: BOOK_TAXONOMY_INCLUDE });
  if (cached) {
    return NextResponse.json(serializeBookTaxonomy(cached));
  }
```

- [ ] **Step 2: `app/api/books/manual/route.ts`**

This route already accepts a `genres` field in its request body (unused until now) alongside `authors`/`description`/`coverUrl`/`coverImageId`/`pageCount`/`publishedYear`. Add tag support too (not accepted before), and resolve both through the resolver. Replace the `prisma.book.create` call and its `return`:

```typescript
  const genreEntities = await Promise.all((genres ?? []).map((name: string) => resolveOrCreateGenre(name)));
  const tagEntities = await Promise.all((tags ?? []).map((name: string) => resolveOrCreateTag(name)));

  const book = await prisma.book.create({
    data: {
      isbn: namespacedIsbn,
      title,
      authors: authors ?? [],
      description: description ?? null,
      coverUrl: coverUrl ?? null,
      coverImageId: coverImageId ?? null,
      pageCount: pageCount ?? null,
      publishedYear: publishedYear ?? null,
      source: "MANUAL",
      genreLinks: { create: genreEntities.map((g) => ({ genreId: g.id })) },
      tagLinks: { create: tagEntities.map((t) => ({ tagId: t.id })) },
    },
    include: BOOK_TAXONOMY_INCLUDE,
  });

  return NextResponse.json(serializeBookTaxonomy(book), { status: 201 });
```

Update the destructuring line to also pull `tags`:

```typescript
  const { isbn, title, authors, description, genres, tags, coverUrl, coverImageId, pageCount, publishedYear } = body;
```

And the earlier `existing` cache-hit return (`if (existing) { return NextResponse.json(existing); }`) needs the same taxonomy-include-and-serialize treatment as lookup's cache hit:

```typescript
  const existing = await prisma.book.findUnique({ where: { isbn: namespacedIsbn }, include: BOOK_TAXONOMY_INCLUDE });
  if (existing) {
    return NextResponse.json(serializeBookTaxonomy(existing));
  }
```

Add the imports:

```typescript
import { resolveOrCreateGenre, resolveOrCreateTag } from "@/lib/genres/resolveOrCreate";
import { BOOK_TAXONOMY_INCLUDE, serializeBookTaxonomy } from "@/lib/books/serializeBook";
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint app/api/books/lookup/route.ts app/api/books/manual/route.ts`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, scan/look up a book that isn't already cached (or use the Lookup tab with a fresh ISBN), confirm it saves without error; check via `npx prisma studio` that `BookGenre` rows were created for it.

- [ ] **Step 5: Commit**

```bash
git add app/api/books/lookup/route.ts app/api/books/manual/route.ts
git commit -m "feat: resolve genres/tags through the entity resolver on book creation"
```

---

### Task 6: `EditableBookFields` gains `genres`

**Files:**
- Modify: `lib/books/bookEditDiff.ts`
- Modify: `tests/lib/books/bookEditDiff.test.ts`

**Interfaces:**
- Produces: `EditableBookFields.genres: string[]` — consumed by Task 7's PATCH/revert routes and Task 9's `BookEditForm`.

- [ ] **Step 1: Add the field**

In `lib/books/bookEditDiff.ts`, add `genres: string[];` to `EditableBookFields`, alongside `tags`:

```typescript
export interface EditableBookFields {
  title: string;
  authors: string[];
  description: string | null;
  genres: string[];
  tags: string[];
  coverUrl: string | null;
  coverImageId: string | null;
}
```

No other change to this file — `computeBookEditDiff`/`computeRevertDiff` already handle arbitrary array fields generically.

- [ ] **Step 2: Update the test fixtures**

In `tests/lib/books/bookEditDiff.test.ts`, every object literal typed as (or passed where TypeScript infers) `EditableBookFields` now needs a `genres` field or `tsc` will fail. Add `genres: ["classic"]` (or `genres: ["Old Genre"]` for the ones already reading "Old ..." for other fields) to the `CURRENT` constant and to every inline object literal passed to `computeBookEditDiff`/`computeRevertDiff` in this file — mirror exactly how `title`/`authors` were added in this same file's prior history (grep this file for `title: "Old Title"` to find every spot that needs the same treatment for `genres`).

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx vitest run tests/lib/books/bookEditDiff.test.ts`
Expected: no type errors; all existing tests still pass unchanged (only fixture shapes grew, no new test cases needed — the diff logic is field-agnostic).

- [ ] **Step 4: Commit**

```bash
git add lib/books/bookEditDiff.ts tests/lib/books/bookEditDiff.test.ts
git commit -m "feat: add genres to EditableBookFields"
```

---

### Task 7: Book edit routes (PATCH + revert) use joins

**Files:**
- Modify: `app/api/books/[id]/route.ts`
- Modify: `app/api/books/[id]/edits/[editId]/revert/route.ts`

**Interfaces:**
- Consumes: `resolveOrCreateGenre`/`resolveOrCreateTag` (Task 2), `BOOK_TAXONOMY_INCLUDE`/`serializeBookTaxonomy` (Task 3), `EditableBookFields.genres` (Task 6).

- [ ] **Step 1: `app/api/books/[id]/route.ts` (PATCH)**

Add the imports:

```typescript
import { resolveOrCreateGenre, resolveOrCreateTag } from "@/lib/genres/resolveOrCreate";
import { BOOK_TAXONOMY_INCLUDE, serializeBookTaxonomy } from "@/lib/books/serializeBook";
```

Update the request-body destructuring and add `genres` validation, mirroring the existing `tags` validation:

```typescript
  const { title, authors, description, genres, tags, coverUrl, coverImageId } = await request.json();

  if (title !== undefined && (typeof title !== "string" || !title.trim())) {
    return NextResponse.json({ error: "title must be a non-empty string" }, { status: 400 });
  }
  if (authors !== undefined && (!Array.isArray(authors) || !authors.every((a: unknown) => typeof a === "string"))) {
    return NextResponse.json({ error: "authors must be an array of strings" }, { status: 400 });
  }
  if (genres !== undefined && (!Array.isArray(genres) || !genres.every((g: unknown) => typeof g === "string"))) {
    return NextResponse.json({ error: "genres must be an array of strings" }, { status: 400 });
  }
  if (tags !== undefined && (!Array.isArray(tags) || !tags.every((t: unknown) => typeof t === "string"))) {
    return NextResponse.json({ error: "tags must be an array of strings" }, { status: 400 });
  }
```

The transaction body needs restructuring: fetch the current book WITH taxonomy, compute the diff against serialized current values, resolve any submitted genres/tags to entity ids, then apply both the scalar-field update and the join-table sync. Replace the entire `prisma.$transaction(async (tx) => { ... })` block with:

```typescript
  const result = await prisma.$transaction(async (tx) => {
    const book = await tx.book.findUnique({ where: { id }, include: BOOK_TAXONOMY_INCLUDE });
    if (!book) {
      return { status: 404 as const, body: { error: "Not found" } };
    }
    const current = serializeBookTaxonomy(book);

    const diff = computeBookEditDiff(
      {
        title: current.title,
        authors: current.authors,
        description: current.description,
        genres: current.genres,
        tags: current.tags,
        coverUrl: current.coverUrl,
        coverImageId: current.coverImageId,
      },
      { title: title?.trim(), authors, description, genres, tags, coverUrl, coverImageId }
    );

    if (!diff) {
      return { status: 200 as const, body: current };
    }

    const scalarData: Record<string, unknown> = {};
    if (diff.newValues.title !== undefined) scalarData.title = diff.newValues.title;
    if (diff.newValues.authors !== undefined) scalarData.authors = diff.newValues.authors;
    if (diff.newValues.description !== undefined) scalarData.description = diff.newValues.description;
    if (diff.newValues.coverUrl !== undefined) scalarData.coverUrl = diff.newValues.coverUrl;
    if (diff.newValues.coverImageId !== undefined) scalarData.coverImageId = diff.newValues.coverImageId;

    if (Object.keys(scalarData).length > 0) {
      await tx.book.update({ where: { id }, data: scalarData });
    }

    if (diff.newValues.genres !== undefined) {
      const genreEntities = await Promise.all(diff.newValues.genres.map((name) => resolveOrCreateGenre(name)));
      await tx.bookGenre.deleteMany({ where: { bookId: id } });
      if (genreEntities.length > 0) {
        await tx.bookGenre.createMany({ data: genreEntities.map((g) => ({ bookId: id, genreId: g.id })) });
      }
    }
    if (diff.newValues.tags !== undefined) {
      const tagEntities = await Promise.all(diff.newValues.tags.map((name) => resolveOrCreateTag(name)));
      await tx.bookTag.deleteMany({ where: { bookId: id } });
      if (tagEntities.length > 0) {
        await tx.bookTag.createMany({ data: tagEntities.map((t) => ({ bookId: id, tagId: t.id })) });
      }
    }

    await tx.bookEdit.create({
      data: {
        bookId: id,
        editedById,
        previousValues: diff.previousValues,
        newValues: diff.newValues,
      },
    });

    const updated = await tx.book.findUniqueOrThrow({ where: { id }, include: BOOK_TAXONOMY_INCLUDE });
    return { status: 200 as const, body: serializeBookTaxonomy(updated) };
  });

  return NextResponse.json(result.body, { status: result.status });
```

Note `resolveOrCreateGenre`/`resolveOrCreateTag` run their `findFirst`/`create` calls against the module-level `prisma` client, not the `tx` transaction client — this is intentional (documented in Task 2): a genre/tag row created mid-transaction by the resolver is immediately visible to `tx.bookGenre.createMany` in the same request regardless of which client created the row (Postgres read-committed visibility within the same connection pool is not an issue here since the resolver's own writes complete and commit independently before the `bookGenre`/`bookTag` sync reads the resulting ids from its return value directly, not from a fresh query) — no correctness gap, just not part of the outer transaction's rollback scope. If this task's implementer disagrees with that reasoning after reading it, treat it as a finding to raise in review rather than silently changing the approach.

- [ ] **Step 2: `app/api/books/[id]/edits/[editId]/revert/route.ts`**

Same treatment. Add the same two imports, and replace the transaction body:

```typescript
  const result = await prisma.$transaction(async (tx) => {
    const [book, targetEdit] = await Promise.all([
      tx.book.findUnique({ where: { id }, include: BOOK_TAXONOMY_INCLUDE }),
      tx.bookEdit.findUnique({ where: { id: editId } }),
    ]);

    if (!book || !targetEdit || targetEdit.bookId !== id) {
      return { status: 404 as const, body: { error: "Not found" } };
    }
    const current = serializeBookTaxonomy(book);

    const diff = computeRevertDiff(
      {
        title: current.title,
        authors: current.authors,
        description: current.description,
        genres: current.genres,
        tags: current.tags,
        coverUrl: current.coverUrl,
        coverImageId: current.coverImageId,
      },
      targetEdit.previousValues as BookEditPatch
    );

    if (!diff) {
      return { status: 200 as const, body: current };
    }

    const scalarData: Record<string, unknown> = {};
    if (diff.newValues.title !== undefined) scalarData.title = diff.newValues.title;
    if (diff.newValues.authors !== undefined) scalarData.authors = diff.newValues.authors;
    if (diff.newValues.description !== undefined) scalarData.description = diff.newValues.description;
    if (diff.newValues.coverUrl !== undefined) scalarData.coverUrl = diff.newValues.coverUrl;
    if (diff.newValues.coverImageId !== undefined) scalarData.coverImageId = diff.newValues.coverImageId;

    if (Object.keys(scalarData).length > 0) {
      await tx.book.update({ where: { id }, data: scalarData });
    }

    if (diff.newValues.genres !== undefined) {
      const genreEntities = await Promise.all(diff.newValues.genres.map((name) => resolveOrCreateGenre(name)));
      await tx.bookGenre.deleteMany({ where: { bookId: id } });
      if (genreEntities.length > 0) {
        await tx.bookGenre.createMany({ data: genreEntities.map((g) => ({ bookId: id, genreId: g.id })) });
      }
    }
    if (diff.newValues.tags !== undefined) {
      const tagEntities = await Promise.all(diff.newValues.tags.map((name) => resolveOrCreateTag(name)));
      await tx.bookTag.deleteMany({ where: { bookId: id } });
      if (tagEntities.length > 0) {
        await tx.bookTag.createMany({ data: tagEntities.map((t) => ({ bookId: id, tagId: t.id })) });
      }
    }

    await tx.bookEdit.create({
      data: {
        bookId: id,
        editedById,
        previousValues: diff.previousValues,
        newValues: diff.newValues,
      },
    });

    const updated = await tx.book.findUniqueOrThrow({ where: { id }, include: BOOK_TAXONOMY_INCLUDE });
    return { status: 200 as const, body: serializeBookTaxonomy(updated) };
  });

  return NextResponse.json(result.body, { status: result.status });
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint "app/api/books/[id]/route.ts" "app/api/books/[id]/edits/[editId]/revert/route.ts"`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, open a book's detail page, edit its description/tags (genres editing UI comes in Task 9 — for now, test via a direct `curl`/fetch PATCH with a `genres` array), confirm the edit history shows the change and `BookGenre`/`BookTag` rows update accordingly; test undo too.

- [ ] **Step 5: Commit**

```bash
git add "app/api/books/[id]/route.ts" "app/api/books/[id]/edits/[editId]/revert/route.ts"
git commit -m "feat: sync genre/tag joins on book edit and revert"
```

---

### Task 8: `GET /api/genres` and `GET /api/tags` search endpoints

**Files:**
- Create: `app/api/genres/route.ts`
- Create: `app/api/tags/route.ts`

**Interfaces:**
- Produces: `GET /api/genres?q=` / `GET /api/tags?q=` → `{ id: string; name: string }[]`, case-insensitive substring match, capped at 20 — consumed by Task 9's autocomplete component.

- [ ] **Step 1: `app/api/genres/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json([]);

  const genres = await prisma.genre.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 20,
  });
  return NextResponse.json(genres);
}
```

- [ ] **Step 2: `app/api/tags/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json([]);

  const tags = await prisma.tag.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 20,
  });
  return NextResponse.json(tags);
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint app/api/genres/route.ts app/api/tags/route.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/genres/route.ts app/api/tags/route.ts
git commit -m "feat: add GET /api/genres and /api/tags search endpoints"
```

---

### Task 9: Autocomplete genre/tag editing UI

**Files:**
- Create: `components/GenreTagAutocomplete.tsx`
- Modify: `components/BookEditForm.tsx`
- Modify: `components/ManualBookForm.tsx`

**Interfaces:**
- Consumes: `GET /api/genres`/`GET /api/tags` (Task 8), `EditableBookFields.genres` (Task 6).
- Produces: `GenreTagAutocomplete` — a reusable multi-select `Autocomplete`, consumed by both forms.

- [ ] **Step 1: `components/GenreTagAutocomplete.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Autocomplete, TextField, CircularProgress } from "@mui/material";

/** Multi-select autocomplete for genres or tags, backed by a search
 * endpoint (GET /api/genres?q= or GET /api/tags?q=). Lets the user pick
 * an existing entity or type a brand-new one (freeSolo) — new values are
 * resolved (matched or created) server-side on save via
 * resolveOrCreateGenre/Tag, so no client-side validation against the
 * entity list is needed here. */
export default function GenreTagAutocomplete({
  label,
  endpoint,
  value,
  onChange,
}: {
  label: string;
  endpoint: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [options, setOptions] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setOptions([]);
      return;
    }
    setLoading(true);
    const timeout = setTimeout(() => {
      fetch(`${endpoint}?q=${encodeURIComponent(trimmed)}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data: { name: string }[]) => setOptions(data.map((d) => d.name)))
        .catch(() => setOptions([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timeout);
  }, [inputValue, endpoint]);

  return (
    <Autocomplete
      multiple
      freeSolo
      options={options}
      value={value}
      inputValue={inputValue}
      onInputChange={(_, newInput) => setInputValue(newInput)}
      onChange={(_, newValue) => onChange(newValue as string[])}
      loading={loading}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          slotProps={{
            input: {
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading && <CircularProgress size={16} />}
                  {params.InputProps.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
    />
  );
}
```

- [ ] **Step 2: `components/BookEditForm.tsx`**

Add genre state and swap both genre/tag inputs to `GenreTagAutocomplete`. Add the import:

```typescript
import GenreTagAutocomplete from "@/components/GenreTagAutocomplete";
```

Add genre state alongside the existing `tags` state (change `tags` from a comma-joined string to a plain array, since the Autocomplete works with arrays directly):

```typescript
  const [genres, setGenres] = useState<string[]>(book.genres);
  const [tags, setTags] = useState<string[]>(book.tags);
```

Remove the old `tags.split(",")...` line from `handleSave`'s `onSave` call and pass the arrays directly, adding `genres`:

```typescript
      await onSave({
        title: trimmedTitle,
        authors: authors.split(",").map((a) => a.trim()).filter(Boolean),
        description: description.trim() || null,
        genres,
        tags,
        coverUrl: coverUrl.trim() || null,
        coverImageId,
      });
```

Replace the old `<TextField label="Tags (comma-separated)" ... />` with two autocompletes:

```tsx
      <GenreTagAutocomplete label="Genres" endpoint="/api/genres" value={genres} onChange={setGenres} />
      <GenreTagAutocomplete label="Tags" endpoint="/api/tags" value={tags} onChange={setTags} />
```

- [ ] **Step 3: `components/ManualBookForm.tsx`**

Same treatment. Add the import, change `genres`/`tags` state from comma-joined strings to arrays:

```typescript
import GenreTagAutocomplete from "@/components/GenreTagAutocomplete";

// ...

  const [genres, setGenres] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
```

Remove the `.split(",")...` transforms in `handleSubmit`'s fetch body, passing the arrays directly:

```typescript
          genres,
          tags,
```

Replace the two `<TextField label="Genres (comma-separated)" .../>` and (if present — this form previously had no tags field; it's new here) add a Tags field, both as autocompletes, placed where the old genres `TextField` was:

```tsx
      <GenreTagAutocomplete label="Genres (optional)" endpoint="/api/genres" value={genres} onChange={setGenres} />
      <GenreTagAutocomplete label="Tags (optional)" endpoint="/api/tags" value={tags} onChange={setTags} />
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx eslint components/GenreTagAutocomplete.tsx components/BookEditForm.tsx components/ManualBookForm.tsx`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run `npm run dev`, open a book's edit form, confirm typing shows matching existing genres/tags and that typing a brand-new value and saving works (creates a new entity via the resolver); same for the manual-entry form.

- [ ] **Step 6: Commit**

```bash
git add components/GenreTagAutocomplete.tsx components/BookEditForm.tsx components/ManualBookForm.tsx
git commit -m "feat: autocomplete genre/tag editing in BookEditForm and ManualBookForm"
```

---

### Task 10: Remaining book-returning routes switch to the serializer

**Files:**
- Modify: `app/api/user-books/route.ts`
- Modify: `app/api/user-books/[id]/route.ts`
- Modify: `app/api/friends/[userId]/compare/route.ts`

**Interfaces:**
- Consumes: `BOOK_TAXONOMY_INCLUDE`/`serializeBookTaxonomy` (Task 3).

- [ ] **Step 1: `app/api/user-books/route.ts`**

Add the import:

```typescript
import { BOOK_TAXONOMY_INCLUDE, serializeBookTaxonomy } from "@/lib/books/serializeBook";
```

In `GET`, replace `include: { book: true }` with the taxonomy include, and map the results:

```typescript
  const userBooks = await prisma.userBook.findMany({
    where: { userId: session.user.id },
    include: { book: { include: BOOK_TAXONOMY_INCLUDE } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(userBooks.map((ub) => ({ ...ub, book: serializeBookTaxonomy(ub.book) })));
```

In `POST`, both `include: { book: true }` calls (the `existing` lookup and the `create`) need the same treatment:

```typescript
  const existing = await prisma.userBook.findUnique({
    where: { userId_bookId: { userId: session.user.id, bookId } },
    include: { book: { include: BOOK_TAXONOMY_INCLUDE } },
  });
  if (existing) {
    return NextResponse.json({ ...existing, book: serializeBookTaxonomy(existing.book) });
  }

  const userBook = await prisma.userBook.create({
    data: { userId: session.user.id, bookId, status },
    include: { book: { include: BOOK_TAXONOMY_INCLUDE } },
  });

  return NextResponse.json({ ...userBook, book: serializeBookTaxonomy(userBook.book) }, { status: 201 });
```

- [ ] **Step 2: `app/api/user-books/[id]/route.ts`**

Add the same import. Replace `include: { book: true }` in the `update` call:

```typescript
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

- [ ] **Step 3: `app/api/friends/[userId]/compare/route.ts`**

Add the import. The two `prisma.userBook.findMany({ ..., include: { book: true } })` calls need the taxonomy include, and the mapping into `computeCompareStats`'s input needs to read `book.genreLinks` via the serializer instead of the (now-stale) raw `book.genres` column:

```typescript
  const [yourBooks, friendBooks] = await Promise.all([
    prisma.userBook.findMany({ where: { userId: session.user.id, status: "READ" }, include: { book: { include: BOOK_TAXONOMY_INCLUDE } } }),
    prisma.userBook.findMany({ where: { userId, status: "READ" }, include: { book: { include: BOOK_TAXONOMY_INCLUDE } } }),
  ]);

  const stats = computeCompareStats(
    yourBooks.map((ub) => ({ genres: serializeBookTaxonomy(ub.book).genres, authors: ub.book.authors })),
    friendBooks.map((ub) => ({ genres: serializeBookTaxonomy(ub.book).genres, authors: ub.book.authors }))
  );
```

(`authors` stays a raw `Book` column, untouched by this migration — only `genres`/`tags` move to entities.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx eslint app/api/user-books/route.ts "app/api/user-books/[id]/route.ts" "app/api/friends/[userId]/compare/route.ts"`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run `npm run dev`, confirm `/bookshelf` still loads and its genre/tag search filter still works (it reads `ub.book.genres`/`ub.book.tags` client-side, unchanged shape); confirm a friend comparison page shows a real, deduplicated genre chart now (fewer, more meaningful categories than before the backfill).

- [ ] **Step 6: Commit**

```bash
git add app/api/user-books/route.ts "app/api/user-books/[id]/route.ts" "app/api/friends/[userId]/compare/route.ts"
git commit -m "feat: switch remaining book-returning routes to the taxonomy serializer"
```

---

### Task 11: Update `scripts/backfill-books.ts` to use the resolver

**Files:**
- Modify: `scripts/backfill-books.ts`

**Interfaces:**
- Consumes: `resolveOrCreateGenre`/`resolveOrCreateTag` (Task 2).

- [ ] **Step 1: Route generated/provider genres and tags through the resolver**

This script currently writes `genres`/`tags` as raw string arrays directly onto `Book` in its `prisma.book.update` call (`backfillBook`'s `data: { authors, description, genres, tags, ... }`). Add the import:

```typescript
import { resolveOrCreateGenre, resolveOrCreateTag } from "@/lib/genres/resolveOrCreate";
```

In `backfillBook`, after computing the final `genres`/`tags` arrays (the existing `const genres = ...` / `const tags = ...` lines stay exactly as they are — they still decide WHICH raw strings to use, from the book's existing values, provider data, or Claude generation), resolve them and replace the `prisma.book.update` call's `data` to sync the join tables instead of writing the raw columns:

```typescript
  const genreEntities = await Promise.all(genres.map((name) => resolveOrCreateGenre(name)));
  const tagEntities = await Promise.all(tags.map((name) => resolveOrCreateTag(name)));

  if (!dryRun && (authors.join(" ") !== book.authors.join(" ") || description !== book.description || genres.join(" ") !== book.genres.join(" ") || tags.join(" ") !== book.tags.join(" ") || complete)) {
    await prisma.book.update({
      where: { id: book.id },
      data: {
        authors,
        description,
        ...(complete ? { backfillAt: new Date() } : {}),
        genreLinks: { deleteMany: {}, create: genreEntities.map((g) => ({ genreId: g.id })) },
        tagLinks: { deleteMany: {}, create: tagEntities.map((t) => ({ tagId: t.id })) },
      },
    });
  }
```

The `book.genres`/`book.tags` reads used earlier in this function (e.g. `needsGenres`, the `genres.join(" ") !== book.genres.join(" ")` comparison, the prompt's `Existing genres: ${book.genres.join(...)}`) all still read the OLD raw columns, which is fine — this script's `main()` query still selects `genres`/`tags` from `Book` for its "what needs backfilling" decision (those columns are stale but still readable data left over from before this migration's cutover; this script doesn't need to switch its read side to the new tables since its job is generating MISSING data, and the old columns are an adequate signal for "does this book already have genres/tags" until Task 12 removes them). Leave `main()`'s query and the `needsGenres`/`needsTags` logic untouched.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint scripts/backfill-books.ts`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `BOOK_BACKFILL_DRY_RUN=true BOOK_BACKFILL_LIMIT=3 npx tsx scripts/backfill-books.ts`
Expected: runs without error (dry run makes no DB writes either way, so this just confirms the script still parses/runs with the new import in place).

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-books.ts
git commit -m "feat: route backfill-books.ts's genres/tags through the entity resolver"
```

---

### Task 12: Drop the old `genres`/`tags` columns (destructive — confirm before running)

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- None — purely removes now-unused columns. No code outside the migration touches `Book.genres`/`Book.tags` after Task 11 (confirm this with the grep in Step 1 before proceeding).

This step is **destructive** (drops columns and their data — recoverable only from a DB backup) and is the one step in this plan that must not be run without your human partner's explicit go-ahead at execution time, per this project's standing rule on irreversible operations. Do not dispatch this task's implementer automatically after Task 11 — stop and confirm first.

- [ ] **Step 1: Confirm nothing still reads the old columns**

Run: `grep -rn "\.genres\b\|\.tags\b" --include="*.ts" --include="*.tsx" app components lib scripts | grep -v node_modules | grep -v "genreLinks\|tagLinks\|BookGenre\|BookTag"`
Expected: no remaining references to `Book.genres`/`Book.tags` as scalar columns outside `scripts/backfill-books.ts` (which Task 11 deliberately left reading them as a "does this book need backfilling" signal — re-read that file's remaining `book.genres`/`book.tags` reads and confirm they're the ones Task 11's Step 1 explicitly decided to leave, not a missed migration spot).

- [ ] **Step 2: Drop the columns**

Remove the `genres` and `tags` lines from the `Book` model in `prisma/schema.prisma`:

```diff
-  genres        String[]
-  tags          String[]   @default([])
```

- [ ] **Step 3: Migrate**

Run: `npx prisma migrate dev --name drop_book_genres_tags_columns`
Expected: a new migration dropping both columns, applied cleanly.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run test`
Expected: clean typecheck, full suite passing (confirms nothing in the codebase or its tests still references the dropped columns).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: drop Book.genres/tags columns, cutover to Genre/Tag entities complete"
```

---

## Final Check

After Task 12, run once more: `npx tsc --noEmit && npm run lint && npm run test` — all three must be clean.
