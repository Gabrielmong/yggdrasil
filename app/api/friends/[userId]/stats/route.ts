import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { symmetricPairWhere } from "@/lib/friends/friendshipWhere";
import { computePersonalStats, type StatsBook } from "@/lib/stats/personalStats";
import { BOOK_TAXONOMY_INCLUDE, serializeBookTaxonomy } from "@/lib/books/serializeBook";

async function readBooks(userId: string): Promise<StatsBook[]> {
  const userBooks = await prisma.userBook.findMany({
    where: { userId },
    select: {
      status: true,
      rating: true,
      finishedAt: true,
      createdAt: true,
      book: { select: { authors: true, pageCount: true, ...BOOK_TAXONOMY_INCLUDE } },
    },
  });

  return userBooks.map((ub) => {
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
}

/** Both users' own personal reading stats side by side — same shape
 * GET /api/stats returns for the current user, computed for both sides
 * so a friend's shelf page can show a "you vs friend" comparison at the
 * simple-counter level, plus the friend's own richer charts, without a
 * separate round trip for each. Same 403-for-both-cases rule as the other
 * friend-scoped routes (not friends AND nonexistent userId both → 403). */
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

  const [yourBooks, friendBooks] = await Promise.all([readBooks(session.user.id), readBooks(userId)]);

  return NextResponse.json({
    you: computePersonalStats(yourBooks),
    friend: computePersonalStats(friendBooks),
  });
}
