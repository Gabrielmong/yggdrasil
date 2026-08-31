import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { fetchFromGoogleBooks } from "@/lib/books/googleBooks";
import { fetchFromOpenLibrary } from "@/lib/books/openLibrary";
import { fetchFromHardcover, fetchFromHardcoverById } from "@/lib/books/hardcover";
import { mergeBookData } from "@/lib/books/mergeBookData";
import { resolveGenreNames, resolveTagNames } from "@/lib/genres/resolveOrCreate";
import { BOOK_TAXONOMY_INCLUDE, serializeBookTaxonomy } from "@/lib/books/serializeBook";
import { generateMetadata, type GeneratedMetadata } from "@/lib/books/generateMetadata";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const isbn = searchParams.get("isbn");
  const googleId = searchParams.get("googleId");
  const hardcoverId = searchParams.get("hardcoverId");
  const lookupKey = isbn ?? googleId ?? hardcoverId;

  if (!lookupKey) {
    return NextResponse.json({ error: "isbn or googleId query parameter is required" }, { status: 400 });
  }

  const cached = await prisma.book.findFirst({
    where: {
      OR: [
        { isbn: lookupKey },
        ...(isbn ? [{ isbn: `manual:${isbn}` }] : []),
      ],
    },
    include: BOOK_TAXONOMY_INCLUDE,
  });
  if (cached) {
    const serialized = serializeBookTaxonomy(cached);
    const needsAuthors = serialized.authors.length === 0;
    const needsDescription = !serialized.description?.trim();
    const needsGenres = serialized.genres.length === 0;
    const needsTags = serialized.tags.length === 0;

    if (!needsAuthors && !needsDescription && !needsGenres && !needsTags) {
      return NextResponse.json(serialized);
    }

    const [googleResult, openLibraryResult, hardcoverResult] = await Promise.allSettled([
      googleId ? fetchFromGoogleBooks(googleId, "id") : isbn ? fetchFromGoogleBooks(isbn, "isbn") : Promise.resolve(null),
      isbn ? fetchFromOpenLibrary(isbn) : Promise.resolve(null),
      isbn ? fetchFromHardcover(isbn) : hardcoverId ? fetchFromHardcoverById(hardcoverId) : Promise.resolve(null),
    ]);
    const google = googleResult.status === "fulfilled" ? googleResult.value : null;
    const openLibrary = openLibraryResult.status === "fulfilled" ? openLibraryResult.value : null;
    const hardcover = hardcoverResult.status === "fulfilled" ? hardcoverResult.value : null;
    const providerData = mergeBookData(lookupKey, google, openLibrary, hardcover);

    let generated: GeneratedMetadata = {};
    try {
      generated = await generateMetadata({
        title: serialized.title,
        authors: serialized.authors.length > 0 ? serialized.authors : providerData?.authors ?? [],
        description: serialized.description ?? providerData?.description ?? null,
        genres: serialized.genres.length > 0 ? serialized.genres : providerData?.genres ?? [],
      });
    } catch (error) {
      console.error("[books/lookup] cached metadata generation failed", error);
    }

    const authors = needsAuthors ? providerData?.authors?.length ? providerData.authors : generated.authors ?? [] : serialized.authors;
    const description = needsDescription ? providerData?.description?.trim() || generated.description || null : serialized.description;
    const genres = needsGenres ? providerData?.genres?.length ? providerData.genres : generated.genres ?? [] : serialized.genres;
    const tags = needsTags ? generated.tags ?? [] : serialized.tags;
    const genreEntities = needsGenres && genres.length > 0 ? await resolveGenreNames(genres) : [];
    const tagEntities = needsTags && tags.length > 0 ? await resolveTagNames(tags) : [];

    const hasUpdates =
      (needsAuthors && authors.length > 0) ||
      (needsDescription && Boolean(description)) ||
      genreEntities.length > 0 ||
      tagEntities.length > 0;

    if (hasUpdates) {
      const updated = await prisma.book.update({
        where: { id: cached.id },
        data: {
          ...(needsAuthors && authors.length > 0 ? { authors } : {}),
          ...(needsDescription && description ? { description } : {}),
          ...(genreEntities.length > 0 ? { genreLinks: { create: genreEntities.map((genre) => ({ genreId: genre.id })) } } : {}),
          ...(tagEntities.length > 0 ? { tagLinks: { create: tagEntities.map((tag) => ({ tagId: tag.id })) } } : {}),
        },
        include: BOOK_TAXONOMY_INCLUDE,
      });
      return NextResponse.json(serializeBookTaxonomy(updated));
    }

    return NextResponse.json(serialized);
  }

  const [googleResult, openLibraryResult, hardcoverResult] = await Promise.allSettled([
    googleId ? fetchFromGoogleBooks(googleId, "id") : isbn ? fetchFromGoogleBooks(isbn, "isbn") : Promise.resolve(null),
    isbn ? fetchFromOpenLibrary(isbn) : Promise.resolve(null),
    isbn ? fetchFromHardcover(isbn) : hardcoverId ? fetchFromHardcoverById(hardcoverId) : Promise.resolve(null),
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

  // Generate clean, reader-facing genres/tags immediately rather than
  // waiting for the periodic backfill script — provider "genres" (especially
  // OpenLibrary's raw bibliographic subject headings) are often far too
  // specific to use directly, so they're passed in only as a hint. Also
  // fills a missing description in the same pass.
  let generated: GeneratedMetadata = {};
  try {
    generated = await generateMetadata({
      title: merged.title,
      authors: merged.authors,
      description: merged.description,
      genres: merged.genres,
    });
  } catch (error) {
    console.error("[books/lookup] metadata generation failed", error);
  }

  const description = merged.description?.trim() || generated.description || null;
  const authors = merged.authors.length > 0 ? merged.authors : generated.authors ?? [];
  const genres = generated.genres && generated.genres.length > 0 ? generated.genres : merged.genres;
  const tags = generated.tags ?? [];

  const [genreEntities, tagEntities] = await Promise.all([resolveGenreNames(genres), resolveTagNames(tags)]);

  const book = await prisma.book.create({
    data: {
      isbn: merged.isbn,
      title: merged.title,
      authors,
      coverUrl: merged.coverUrl,
      description,
      pageCount: merged.pageCount,
      publishedYear: merged.publishedYear,
      source: merged.source,
      rawResponse: { google, openLibrary, hardcover },
      genreLinks: { create: genreEntities.map((g) => ({ genreId: g.id })) },
      tagLinks: { create: tagEntities.map((t) => ({ tagId: t.id })) },
    },
    include: BOOK_TAXONOMY_INCLUDE,
  });

  return NextResponse.json(serializeBookTaxonomy(book), { status: 201 });
}
