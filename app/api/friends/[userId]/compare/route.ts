import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { symmetricPairWhere } from "@/lib/friends/friendshipWhere";
import { computeCompareStats } from "@/lib/friends/compareStats";
import { BOOK_TAXONOMY_INCLUDE, serializeBookTaxonomy } from "@/lib/books/serializeBook";

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

  const [yourBooks, friendBooks] = await Promise.all([
    prisma.userBook.findMany({ where: { userId: session.user.id, status: "READ" }, include: { book: { include: BOOK_TAXONOMY_INCLUDE } } }),
    prisma.userBook.findMany({ where: { userId, status: "READ" }, include: { book: { include: BOOK_TAXONOMY_INCLUDE } } }),
  ]);

  const stats = computeCompareStats(
    yourBooks.map((ub) => ({ genres: serializeBookTaxonomy(ub.book).genres, authors: ub.book.authors })),
    friendBooks.map((ub) => ({ genres: serializeBookTaxonomy(ub.book).genres, authors: ub.book.authors }))
  );

  return NextResponse.json(stats);
}
