import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { fetchFromGoogleBooks } from "@/lib/books/googleBooks";
import { fetchFromOpenLibrary } from "@/lib/books/openLibrary";
import { fetchFromHardcover } from "@/lib/books/hardcover";
import { mergeBookData } from "@/lib/books/mergeBookData";
import { resolveGenreNames, resolveTagNames } from "@/lib/genres/resolveOrCreate";
import { BOOK_TAXONOMY_INCLUDE, serializeBookTaxonomy } from "@/lib/books/serializeBook";
import { generateMetadata } from "@/lib/books/generateMetadata";

const limit = Number.parseInt(process.env.BOOK_BACKFILL_LIMIT ?? "100", 10);
const dryRun = process.env.BOOK_BACKFILL_DRY_RUN === "true";

async function backfillBook(book: { id: string; isbn: string; title: string; authors: string[]; description: string | null; genres: string[]; tags: string[] }) {
  // NOTE: book.genres/book.tags here are the SERIALIZED (join-table-derived)
  // values passed in by main() below — not the old scalar columns, which are
  // no longer written anywhere and would always read empty.
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

  const scalarChanged = authors.join("\u0000") !== book.authors.join("\u0000") || description !== book.description;
  const genresChanged = genres.join("\u0000") !== book.genres.join("\u0000");
  const tagsChanged = tags.join("\u0000") !== book.tags.join("\u0000");

  if (!dryRun && (scalarChanged || genresChanged || tagsChanged || complete)) {
    const data: Record<string, unknown> = {
      authors,
      description,
      ...(complete ? { backfillAt: new Date() } : {}),
    };
    // Only resolve/sync genres or tags when they actually changed — never
    // unconditionally wipe-and-recreate links that are already correct, and
    // never spend a resolver call (possibly hitting Claude) when nothing
    // about this book's genres/tags needs to change.
    if (genresChanged) {
      const genreEntities = await resolveGenreNames(genres);
      data.genreLinks = { deleteMany: {}, create: genreEntities.map((g) => ({ genreId: g.id })) };
    }
    if (tagsChanged) {
      const tagEntities = await resolveTagNames(tags);
      data.tagLinks = { deleteMany: {}, create: tagEntities.map((t) => ({ tagId: t.id })) };
    }
    await prisma.book.update({ where: { id: book.id }, data });
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
        { genreLinks: { none: {} } },
        { tagLinks: { none: {} } },
      ],
    },
    orderBy: { fetchedAt: "asc" },
    take: Number.isFinite(limit) && limit > 0 ? limit : 100,
    select: { id: true, isbn: true, title: true, authors: true, description: true, ...BOOK_TAXONOMY_INCLUDE },
  });

  let completed = 0;
  let claudeUsed = 0;
  for (const rawBook of books) {
    const book = serializeBookTaxonomy(rawBook);
    try {
      const result = await backfillBook(book);
      if (result.complete) completed += 1;
      if (result.usedClaude) claudeUsed += 1;
      console.log(`${result.complete ? "updated" : "incomplete"}: ${rawBook.title}`);
    } catch (error) {
      console.error(`failed: ${rawBook.title}`, error);
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
