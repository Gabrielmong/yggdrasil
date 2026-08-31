import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseClusterResponse, type Cluster } from "@/lib/genres/clusterResponse";

// Re-consolidation pass over the ALREADY-CREATED Genre/Tag entities (as
// opposed to backfill-genres-tags.ts, which clusters raw book strings into
// entities for the first time). Run this whenever the taxonomy has
// accumulated too many near-duplicate genres/tags (e.g. after enough books
// were added before generateMetadata started biasing new entries toward
// reuse). Safe to re-run — a fully-consolidated set just clusters into
// itself 1:1 and merges/deletes nothing.
const dryRun = process.env.BOOK_BACKFILL_DRY_RUN === "true";
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

async function clusterExistingNames(names: string[], kind: "genre" | "tag"): Promise<Cluster[]> {
  if (names.length === 0) return [];
  if (!anthropic) return names.map((name) => ({ canonical: name, raw: [name] }));

  try {
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
      max_tokens: 16384,
      messages: [
        {
          role: "user",
          content: [
            `These are the ${names.length} existing canonical book ${kind} names in a reading-tracker app. Many are near-duplicates, overly specific bibliographic subject headings, or translations of the same concept (e.g. "Fantasy fiction" and "American Fantasy fiction" should merge; "Absurd (Philosophy)" and "Absurde (Philosophie) dans la littérature" should merge). Group them into broad, standard, reader-facing categories, merging aggressively — prefer fewer, broader groups over many narrow ones.`,
            `Names:\n${names.map((v) => `- ${v}`).join("\n")}`,
            'Return only valid JSON: {"clusters": [{"canonical": string, "raw": string[]}]} — every input name must appear in exactly one cluster\'s "raw" array, and "canonical" MUST be exactly one of that cluster\'s own "raw" values (verbatim, the clearest/most standard existing name to keep) — never invent a new label.',
          ].join("\n\n"),
        },
      ],
    });
    if (response.stop_reason === "max_tokens") {
      console.error(`[consolidate-genres-tags] response for ${kind} was truncated (hit max_tokens) — falling back to 1:1 this run`);
      return names.map((name) => ({ canonical: name, raw: [name] }));
    }
    const text = response.content.find((block) => block.type === "text");
    if (text?.type !== "text") return names.map((name) => ({ canonical: name, raw: [name] }));
    return parseClusterResponse(text.text, names);
  } catch (error) {
    console.error(`[consolidate-genres-tags] clustering failed for ${kind}, skipping this run`, error);
    return names.map((name) => ({ canonical: name, raw: [name] }));
  }
}

async function consolidateKind(kind: "genre" | "tag") {
  const rows =
    kind === "genre"
      ? await prisma.genre.findMany({ select: { id: true, name: true, _count: { select: { books: true } } } })
      : await prisma.tag.findMany({ select: { id: true, name: true, _count: { select: { books: true } } } });

  console.log(`[${kind}] ${rows.length} existing canonical entities`);
  const clusters = await clusterExistingNames(rows.map((r) => r.name), kind);
  const mergeClusters = clusters.filter((c) => c.raw.length > 1);
  console.log(`[${kind}] clustered into ${clusters.length} groups (${mergeClusters.length} need merging)`);

  const byName = new Map(rows.map((r) => [r.name, r]));
  let merged = 0;

  for (const cluster of mergeClusters) {
    const members = cluster.raw.map((name) => byName.get(name)).filter((r): r is (typeof rows)[number] => Boolean(r));
    if (members.length < 2) continue;

    // The survivor must be one of this cluster's own existing entities —
    // prefer the LLM's chosen canonical if it's actually a member (per the
    // prompt's own requirement); otherwise fall back to the most-used one.
    const survivor =
      members.find((m) => m.name === cluster.canonical) ??
      [...members].sort((a, b) => b._count.books - a._count.books)[0];
    const losers = members.filter((m) => m.id !== survivor.id);
    if (losers.length === 0) continue;

    console.log(`[${kind}] merging [${losers.map((l) => l.name).join(", ")}] -> "${survivor.name}"`);
    if (dryRun) {
      merged += losers.length;
      continue;
    }

    for (const loser of losers) {
      // Bulk-reassign every book linked to the loser onto the survivor in
      // one query. Prisma has no native upsertMany, but every row here is a
      // plain "insert if missing" (update:{} was always a no-op) — exactly
      // what createMany's skipDuplicates does at the DB level via
      // INSERT ... ON CONFLICT DO NOTHING, avoiding a per-book round trip.
      if (kind === "genre") {
        const links = await prisma.bookGenre.findMany({ where: { genreId: loser.id }, select: { bookId: true } });
        if (links.length > 0) {
          await prisma.bookGenre.createMany({
            data: links.map((link) => ({ bookId: link.bookId, genreId: survivor.id })),
            skipDuplicates: true,
          });
        }
      } else {
        const links = await prisma.bookTag.findMany({ where: { tagId: loser.id }, select: { bookId: true } });
        if (links.length > 0) {
          await prisma.bookTag.createMany({
            data: links.map((link) => ({ bookId: link.bookId, tagId: survivor.id })),
            skipDuplicates: true,
          });
        }
      }

      // Deleting the loser cascades any remaining BookGenre/BookTag rows for
      // it (onDelete: Cascade) — including any we deliberately skipped above
      // because the book was already linked to the survivor. Tolerate the
      // loser already being gone (P2025) — belt-and-braces against the same
      // name appearing in two clusters (parseClusterResponse now guards
      // against that too, but this keeps a partial/re-run safe either way.
      try {
        if (kind === "genre") {
          await prisma.genre.delete({ where: { id: loser.id } });
        } else {
          await prisma.tag.delete({ where: { id: loser.id } });
        }
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025")) throw error;
      }
      merged += 1;
    }
  }

  console.log(`[${kind}] merged ${merged} redundant entities${dryRun ? " (dry run, nothing written)" : ""}`);
}

async function main() {
  await consolidateKind("genre");
  await consolidateKind("tag");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
