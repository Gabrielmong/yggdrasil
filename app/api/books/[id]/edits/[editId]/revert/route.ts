import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { computeRevertDiff, type BookEditPatch } from "@/lib/books/bookEditDiff";
import { resolveOrCreateGenre, resolveOrCreateTag } from "@/lib/genres/resolveOrCreate";
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
}
