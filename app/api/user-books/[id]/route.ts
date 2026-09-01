import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { BOOK_TAXONOMY_INCLUDE, serializeBookTaxonomy } from "@/lib/books/serializeBook";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.userBook.findUnique({ where: { id } });
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { status, rating, notes, startedAt, finishedAt } = await request.json();

  const validStatuses = ["WANT_TO_READ", "READING", "READ"];
  if (status !== undefined && !validStatuses.includes(status)) {
    return NextResponse.json({ error: "status must be one of WANT_TO_READ, READING, READ" }, { status: 400 });
  }

  if (
    rating !== undefined &&
    rating !== null &&
    (!Number.isInteger(rating) || rating < 1 || rating > 5)
  ) {
    return NextResponse.json({ error: "rating must be an integer between 1 and 5" }, { status: 400 });
  }

  const updated = await prisma.userBook.update({
    where: { id },
    data: {
      ...(status !== undefined && { status }),
      ...(rating !== undefined && { rating }),
      ...(notes !== undefined && { notes }),
      ...(startedAt !== undefined && { startedAt: startedAt ? new Date(startedAt) : null }),
      ...(finishedAt !== undefined && { finishedAt: finishedAt ? new Date(finishedAt) : null }),
    },
    include: { book: { include: BOOK_TAXONOMY_INCLUDE } },
  });

  return NextResponse.json({ ...updated, book: serializeBookTaxonomy(updated.book) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.userBook.findUnique({ where: { id } });
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.userBook.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
