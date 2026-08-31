import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { fetchFromGoogleBooks } from "@/lib/books/googleBooks";
import { fetchFromOpenLibrary } from "@/lib/books/openLibrary";
import { fetchFromHardcover } from "@/lib/books/hardcover";
import { mergeBookData } from "@/lib/books/mergeBookData";
import { resolveOrCreateGenre } from "@/lib/genres/resolveOrCreate";
import { BOOK_TAXONOMY_INCLUDE, serializeBookTaxonomy } from "@/lib/books/serializeBook";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const isbn = searchParams.get("isbn");
  const googleId = searchParams.get("googleId");
  const lookupKey = isbn ?? googleId;

  if (!lookupKey) {
    return NextResponse.json({ error: "isbn or googleId query parameter is required" }, { status: 400 });
  }

  const cached = await prisma.book.findUnique({ where: { isbn: lookupKey }, include: BOOK_TAXONOMY_INCLUDE });
  if (cached) {
    return NextResponse.json(serializeBookTaxonomy(cached));
  }

  const [googleResult, openLibraryResult, hardcoverResult] = await Promise.allSettled([
    googleId ? fetchFromGoogleBooks(googleId, "id") : fetchFromGoogleBooks(isbn!, "isbn"),
    isbn ? fetchFromOpenLibrary(isbn) : Promise.resolve(null),
    isbn ? fetchFromHardcover(isbn) : Promise.resolve(null),
  ]);

  const google = googleResult.status === "fulfilled" ? googleResult.value : null;
  const openLibrary = openLibraryResult.status === "fulfilled" ? openLibraryResult.value : null;
  const hardcover = hardcoverResult.status === "fulfilled" ? hardcoverResult.value : null;

  console.info("[books/lookup] provider results", {
    googleBooks: Boolean(google),
    openLibrary: Boolean(openLibrary),
    hardcover: Boolean(hardcover),
  });

  const merged = mergeBookData(lookupKey, google, openLibrary, hardcover, "HARDCOVER");
  if (!merged) {
    return NextResponse.json({ error: "No book found for that lookup" }, { status: 404 });
  }

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
}
