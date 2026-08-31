import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { computeBookEditDiff } from "@/lib/books/bookEditDiff";
import { isValidImageId } from "@/lib/storage/isValidImageId";
import { resolveGenreNames, resolveTagNames } from "@/lib/genres/resolveOrCreate";
import { BOOK_TAXONOMY_INCLUDE, serializeBookTaxonomy } from "@/lib/books/serializeBook";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const editedById = session.user.id;
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
  if (description !== undefined && description !== null && typeof description !== "string") {
    return NextResponse.json({ error: "description must be a string or null" }, { status: 400 });
  }
  if (coverUrl !== undefined && coverUrl !== null && typeof coverUrl !== "string") {
    return NextResponse.json({ error: "coverUrl must be a string or null" }, { status: 400 });
  }
  if (coverImageId !== undefined && coverImageId !== null) {
    if (typeof coverImageId !== "string" || !isValidImageId(coverImageId)) {
      return NextResponse.json({ error: "coverImageId must be a valid uuid or null" }, { status: 400 });
    }
  }

  // Resolve genre/tag names to canonical entities BEFORE the transaction:
  // resolving may call Claude on a miss, which must not happen inside an
  // interactive transaction (risks the transaction timeout, and a rolled-
  // back transaction can't undo a Genre/Tag row the resolver already
  // created against the global client). Diffing against the resolved
  // (canonical) names below also means edit history records what the book
  // actually ends up displaying, not a raw synonym, and resubmitting a
  // synonym of an already-set genre correctly produces no diff instead of
  // a spurious edit record.
  const genreEntities = genres !== undefined ? await resolveGenreNames(genres) : undefined;
  const tagEntities = tags !== undefined ? await resolveTagNames(tags) : undefined;
  const resolvedGenres = genreEntities?.map((g) => g.name);
  const resolvedTags = tagEntities?.map((t) => t.name);

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
      { title: title?.trim(), authors, description, genres: resolvedGenres, tags: resolvedTags, coverUrl, coverImageId }
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
      await tx.bookGenre.deleteMany({ where: { bookId: id } });
      if (genreEntities && genreEntities.length > 0) {
        await tx.bookGenre.createMany({
          data: genreEntities.map((g) => ({ bookId: id, genreId: g.id })),
          skipDuplicates: true,
        });
      }
    }
    if (diff.newValues.tags !== undefined) {
      await tx.bookTag.deleteMany({ where: { bookId: id } });
      if (tagEntities && tagEntities.length > 0) {
        await tx.bookTag.createMany({
          data: tagEntities.map((t) => ({ bookId: id, tagId: t.id })),
          skipDuplicates: true,
        });
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
}
