import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { symmetricPairWhere } from "@/lib/friends/friendshipWhere";
import { computeCompareStats, type CompareBookInput } from "@/lib/friends/compareStats";
import { BOOK_TAXONOMY_INCLUDE, serializeBookTaxonomy } from "@/lib/books/serializeBook";

async function fetchReadBooks(userId: string): Promise<CompareBookInput[]> {
  const userBooks = await prisma.userBook.findMany({
    where: { userId, status: "READ" },
    include: { book: { include: BOOK_TAXONOMY_INCLUDE } },
  });

  return userBooks.map((ub) => {
    const book = serializeBookTaxonomy(ub.book);
    return {
      bookId: book.id,
      title: book.title,
      authors: book.authors,
      genres: book.genres,
      coverUrl: book.coverUrl,
      coverImageId: book.coverImageId,
      rating: ub.rating,
    };
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { userId } = await params;

  const friendship = await prisma.friendship.findFirst({
    where: { ...symmetricPairWhere(session.user.id, userId), status: "ACCEPTED" },
  });
  if (!friendship) {
    return NextResponse.json({ error: "Not friends" }, { status: 403 });
  }

  const [yourReadBooks, friendReadBooks, yourShelf] = await Promise.all([
    fetchReadBooks(session.user.id),
    fetchReadBooks(userId),
    // Every book on your shelf regardless of status, purely to exclude
    // books you already have from the recommendations list below.
    prisma.userBook.findMany({ where: { userId: session.user.id }, select: { bookId: true } }),
  ]);

  const stats = computeCompareStats(yourReadBooks, friendReadBooks, new Set(yourShelf.map((ub) => ub.bookId)));

  return NextResponse.json(stats);
}
