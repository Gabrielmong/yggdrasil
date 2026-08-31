import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { computeRevertDiff, type BookEditPatch } from "@/lib/books/bookEditDiff";
import { resolveGenreNames, resolveTagNames } from "@/lib/genres/resolveOrCreate";
import { BOOK_TAXONOMY_INCLUDE, serializeBookTaxonomy } from "@/lib/books/serializeBook";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; editId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, editId } = await params;
  const editedById = session.user.id;

  // Preliminary (non-transactional) read: compute the revert diff and
  // resolve any genre/tag names it touches before opening a transaction —
  // same reasoning as the PATCH route: a Claude call must never happen
  // inside an interactive transaction.
  const [book, targetEdit] = await Promise.all([
    prisma.book.findUnique({ where: { id }, include: BOOK_TAXONOMY_INCLUDE }),
    prisma.bookEdit.findUnique({ where: { id: editId } }),
  ]);
  if (!book || !targetEdit || targetEdit.bookId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const current = serializeBookTaxonomy(book);
  const previousValues = targetEdit.previousValues as BookEditPatch;

  const preliminaryDiff = computeRevertDiff(
    {
      title: current.title,
      authors: current.authors,
      description: current.description,
      genres: current.genres,
      tags: current.tags,
      coverUrl: current.coverUrl,
      coverImageId: current.coverImageId,
    },
    previousValues
  );

  if (!preliminaryDiff) {
    return NextResponse.json(current, { status: 200 });
  }

  const genreEntities =
    preliminaryDiff.newValues.genres !== undefined ? await resolveGenreNames(preliminaryDiff.newValues.genres) : undefined;
  const tagEntities =
    preliminaryDiff.newValues.tags !== undefined ? await resolveTagNames(preliminaryDiff.newValues.tags) : undefined;
  const resolvedGenres = genreEntities?.map((g) => g.name);
  const resolvedTags = tagEntities?.map((t) => t.name);

  const result = await prisma.$transaction(async (tx) => {
    // Re-fetch inside the transaction to guard against a concurrent edit
    // landing between the preliminary read above and this write.
    const [currentBook, currentTargetEdit] = await Promise.all([
      tx.book.findUnique({ where: { id }, include: BOOK_TAXONOMY_INCLUDE }),
      tx.bookEdit.findUnique({ where: { id: editId } }),
    ]);
    if (!currentBook || !currentTargetEdit || currentTargetEdit.bookId !== id) {
      return { status: 404 as const, body: { error: "Not found" } };
    }
    const freshCurrent = serializeBookTaxonomy(currentBook);

    const diff = computeRevertDiff(
      {
        title: freshCurrent.title,
        authors: freshCurrent.authors,
        description: freshCurrent.description,
        genres: freshCurrent.genres,
        tags: freshCurrent.tags,
        coverUrl: freshCurrent.coverUrl,
        coverImageId: freshCurrent.coverImageId,
      },
      {
        ...previousValues,
        ...(resolvedGenres !== undefined ? { genres: resolvedGenres } : {}),
        ...(resolvedTags !== undefined ? { tags: resolvedTags } : {}),
      }
    );

    if (!diff) {
      return { status: 200 as const, body: freshCurrent };
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
