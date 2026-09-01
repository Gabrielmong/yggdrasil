import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const PAGE_SIZE = 20;

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const friendships = await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    select: { requesterId: true, addresseeId: true },
  });
  const friendIds = friendships.map((f) => (f.requesterId === userId ? f.addresseeId : f.requesterId));

  if (friendIds.length === 0) {
    return NextResponse.json({ events: [], nextCursor: null });
  }

  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before");
  const cursorEvent = before
    ? await prisma.activityEvent.findFirst({ where: { id: before, userId: { in: friendIds } } })
    : null;

  if (before && !cursorEvent) {
    return NextResponse.json({ events: [], nextCursor: null });
  }

  const events = await prisma.activityEvent.findMany({
    where: {
      userId: { in: friendIds },
      ...(cursorEvent && {
        OR: [
          { createdAt: { lt: cursorEvent.createdAt } },
          { createdAt: cursorEvent.createdAt, id: { lt: cursorEvent.id } },
        ],
      }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE,
    include: {
      user: { select: { id: true, name: true, image: true, avatarImageId: true } },
      book: { select: { id: true, title: true, authors: true, coverUrl: true, coverImageId: true } },
    },
  });

  return NextResponse.json({
    events,
    nextCursor: events.length === PAGE_SIZE ? events[events.length - 1].id : null,
  });
}
