import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { fetchFromGoogleBooks } from "@/lib/books/googleBooks";
import { fetchFromOpenLibrary } from "@/lib/books/openLibrary";
import { fetchFromHardcover } from "@/lib/books/hardcover";
import { mergeBookData } from "@/lib/books/mergeBookData";

const limit = Number.parseInt(process.env.BOOK_BACKFILL_LIMIT ?? "100", 10);
const dryRun = process.env.BOOK_BACKFILL_DRY_RUN === "true";
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

interface GeneratedMetadata {
  authors?: string[];
  description?: string;
  genres?: string[];
  tags?: string[];
}

function parseGeneratedMetadata(text: string): GeneratedMetadata {
  const json = text.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== "object") return {};

  const record = parsed as Record<string, unknown>;

  console.log("Generated metadata:", record);
  return {
    authors: Array.isArray(record.authors)
      ? record.authors.filter((author): author is string => typeof author === "string").map((author) => author.trim()).filter(Boolean)
      : undefined,
    description: typeof record.description === "string" ? record.description.trim() : undefined,
    genres: Array.isArray(record.genres)
      ? record.genres.filter((genre): genre is string => typeof genre === "string").map((genre) => genre.trim()).filter(Boolean)
      : undefined,
    tags: Array.isArray(record.tags)
      ? record.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean)
      : undefined,
  };
}

async function generateMetadata(book: { title: string; authors: string[]; description: string | null; genres: string[] }) {
  if (!anthropic) return {};

  const response = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: [
          "Create missing reading metadata for this book. Detect the language from the title, author names, and any supplied metadata, then write the description, genres, and tags in that same language.",
          "Return only valid JSON with this shape: {\"authors\": string[], \"description\": string, \"genres\": string[], \"tags\": string[] }.",
          "Only provide authors when the author is confidently identifiable from the title or supplied metadata. If uncertain, return an empty authors array. Never invent an author.",
          "Write a neutral synopsis without inventing specific details. Use 2 to 5 concise genres and 3 to 6 concise topical tags.",
          `Title: ${book.title}`,
          `Authors: ${book.authors.join(", ") || "Unknown"}`,
          `Existing description: ${book.description ?? "Missing"}`,
          `Existing genres: ${book.genres.join(", ") || "Missing"}`,
        ].join("\n"),
      },
    ],
  });

  const text = response.content.find((block) => block.type === "text");
  return text?.type === "text" ? parseGeneratedMetadata(text.text) : {};
}

async function backfillBook(book: { id: string; isbn: string; title: string; authors: string[]; description: string | null; genres: string[]; tags: string[] }) {
  const [googleResult, openLibraryResult, hardcoverResult] = await Promise.allSettled([
    fetchFromGoogleBooks(book.isbn, "isbn"),
    fetchFromOpenLibrary(book.isbn),
    fetchFromHardcover(book.isbn),
  ]);
  const google = googleResult.status === "fulfilled" ? googleResult.value : null;
  const openLibrary = openLibraryResult.status === "fulfilled" ? openLibraryResult.value : null;
  const hardcover = hardcoverResult.status === "fulfilled" ? hardcoverResult.value : null;
  const merged = mergeBookData(book.isbn, google, openLibrary, hardcover);

  const providerDescription = merged?.description ?? null;
  const providerAuthors = merged?.authors ?? [];
  const providerGenres = merged?.genres ?? [];
  const needsAuthors = book.authors.length === 0 && providerAuthors.length === 0;
  const needsDescription = !book.description?.trim() && !providerDescription;
  const needsGenres = book.genres.length === 0 && providerGenres.length === 0;
  const needsTags = book.tags.length === 0;
  const generated = needsAuthors || needsDescription || needsGenres || needsTags ? await generateMetadata({
    title: book.title,
    authors: book.authors,
    description: providerDescription,
    genres: providerGenres,
  }) : {};

  const authors = book.authors.length > 0 ? book.authors : providerAuthors.length > 0 ? providerAuthors : generated.authors ?? [];
  const description = book.description?.trim() || providerDescription?.trim() || generated.description || null;
  const genres = book.genres.length > 0 ? book.genres : providerGenres.length > 0 ? providerGenres : generated.genres ?? [];
  const tags = book.tags.length > 0 ? book.tags : generated.tags ?? [];
  const complete = authors.length > 0 && Boolean(description?.trim()) && genres.length > 0 && tags.length > 0;

  if (!dryRun && (authors.join("\u0000") !== book.authors.join("\u0000") || description !== book.description || genres.join("\u0000") !== book.genres.join("\u0000") || tags.join("\u0000") !== book.tags.join("\u0000") || complete)) {
    await prisma.book.update({
      where: { id: book.id },
      data: { authors, description, genres, tags, ...(complete ? { backfillAt: new Date() } : {}) },
    });
  }

  return { complete, usedClaude: Boolean(generated.authors?.length || generated.description || generated.genres?.length || generated.tags?.length), authors, description, genres, tags };
}

async function main() {
  const books = await prisma.book.findMany({
    where: {
      OR: [
        { backfillAt: null },
        { authors: { isEmpty: true } },
        { description: null },
        { genres: { isEmpty: true } },
        { tags: { isEmpty: true } },
      ],
    },
    orderBy: { fetchedAt: "asc" },
    take: Number.isFinite(limit) && limit > 0 ? limit : 100,
    select: { id: true, isbn: true, title: true, authors: true, description: true, genres: true, tags: true },
  });

  let completed = 0;
  let claudeUsed = 0;
  for (const book of books) {
    try {
      const result = await backfillBook(book);
      if (result.complete) completed += 1;
      if (result.usedClaude) claudeUsed += 1;
      console.log(`${result.complete ? "updated" : "incomplete"}: ${book.title}`);
    } catch (error) {
      console.error(`failed: ${book.title}`, error);
    }
  }

  console.log(`Backfill finished: ${completed}/${books.length} complete; Claude used for ${claudeUsed}; dry run: ${dryRun}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
