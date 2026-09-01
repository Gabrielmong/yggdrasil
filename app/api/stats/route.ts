import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { computePersonalStats } from "@/lib/stats/personalStats";
import { BOOK_TAXONOMY_INCLUDE, serializeBookTaxonomy } from "@/lib/books/serializeBook";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userBooks = await prisma.userBook.findMany({
    where: { userId: session.user.id },
    select: {
      status: true,
      rating: true,
      finishedAt: true,
      createdAt: true,
      book: { select: { authors: true, pageCount: true, ...BOOK_TAXONOMY_INCLUDE } },
    },
  });

  const books = userBooks.map((ub) => {
    const book = serializeBookTaxonomy(ub.book);
    return {
      genres: book.genres,
      authors: book.authors,
      rating: ub.rating,
      pageCount: book.pageCount,
      finishedAt: ub.finishedAt ? ub.finishedAt.toISOString() : null,
      createdAt: ub.createdAt.toISOString(),
      status: ub.status,
    };
  });

  return NextResponse.json(computePersonalStats(books));
}
