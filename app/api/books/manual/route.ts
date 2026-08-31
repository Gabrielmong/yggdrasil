import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isValidImageId } from "@/lib/storage/isValidImageId";
import { resolveOrCreateGenre, resolveOrCreateTag } from "@/lib/genres/resolveOrCreate";
import { BOOK_TAXONOMY_INCLUDE, serializeBookTaxonomy } from "@/lib/books/serializeBook";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { isbn, title, authors, description, genres, tags, coverUrl, coverImageId, pageCount, publishedYear } = body;

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (coverImageId !== undefined && coverImageId !== null) {
    if (typeof coverImageId !== "string" || !isValidImageId(coverImageId)) {
      return NextResponse.json({ error: "coverImageId must be a valid uuid or null" }, { status: 400 });
    }
  }

  // Manual entries are always stored in a distinct "manual:" namespace so a
  // hand-typed ISBN can never collide with (or shadow) a real ISBN in the
  // shared Book cache — see finding #5 of the final review.
  const typedIsbn = typeof isbn === "string" ? isbn.trim() : "";
  const namespacedIsbn = typedIsbn.startsWith("manual:")
    ? typedIsbn
    : `manual:${typedIsbn || Date.now()}`;

  const existing = await prisma.book.findUnique({ where: { isbn: namespacedIsbn }, include: BOOK_TAXONOMY_INCLUDE });
  if (existing) {
    return NextResponse.json(serializeBookTaxonomy(existing));
  }

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
}
