import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { BOOK_TAXONOMY_INCLUDE, serializeBookTaxonomy } from "@/lib/books/serializeBook";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userBooks = await prisma.userBook.findMany({
    where: { userId: session.user.id },
    include: { book: { include: BOOK_TAXONOMY_INCLUDE } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(userBooks.map((ub) => ({ ...ub, book: serializeBookTaxonomy(ub.book) })));
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bookId, status } = await request.json();
  if (!bookId || !status) {
    return NextResponse.json({ error: "bookId and status are required" }, { status: 400 });
  }

  const existing = await prisma.userBook.findUnique({
    where: { userId_bookId: { userId: session.user.id, bookId } },
    include: { book: { include: BOOK_TAXONOMY_INCLUDE } },
  });
  if (existing) {
    return NextResponse.json({ ...existing, book: serializeBookTaxonomy(existing.book) });
  }

  const userBook = await prisma.userBook.create({
    data: { userId: session.user.id, bookId, status },
    include: { book: { include: BOOK_TAXONOMY_INCLUDE } },
  });

  return NextResponse.json({ ...userBook, book: serializeBookTaxonomy(userBook.book) }, { status: 201 });
}
