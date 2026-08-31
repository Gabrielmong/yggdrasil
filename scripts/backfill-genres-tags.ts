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
      const row = kind === "genre"
        ? await (async () => {
            const existing = await prisma.genre.findFirst({ where: { name: { equals: cluster.canonical, mode: "insensitive" } } });
            return existing ?? (await prisma.genre.create({ data: { name: cluster.canonical } }));
          })()
        : await (async () => {
            const existing = await prisma.tag.findFirst({ where: { name: { equals: cluster.canonical, mode: "insensitive" } } });
            return existing ?? (await prisma.tag.create({ data: { name: cluster.canonical } }));
          })();
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
      console.log(`[${kind}] linking book ${book.id} to canonical ${kind} "${name}"`);
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
