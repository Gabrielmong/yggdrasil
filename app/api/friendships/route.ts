import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { symmetricPairWhere } from "@/lib/friends/friendshipWhere";

const USER_SELECT = { id: true, name: true, email: true, image: true, avatarImageId: true } as const;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const rows = await prisma.friendship.findMany({
    where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
    include: { requester: { select: USER_SELECT }, addressee: { select: USER_SELECT } },
  });

  const friends: unknown[] = [];
  const incoming: unknown[] = [];
  const outgoing: unknown[] = [];

  for (const row of rows) {
    const isRequester = row.requesterId === userId;
    const other = isRequester ? row.addressee : row.requester;
    const entry = { friendshipId: row.id, user: other };

    if (row.status === "ACCEPTED") {
      friends.push(entry);
    } else if (row.status === "PENDING") {
      (isRequester ? outgoing : incoming).push(entry);
    }
    // DECLINED rows are omitted entirely — not shown in any list.
  }

  return NextResponse.json({ friends, incoming, outgoing });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { addresseeId } = await request.json();
  if (typeof addresseeId !== "string" || !addresseeId) {
    return NextResponse.json({ error: "addresseeId is required" }, { status: 400 });
  }
  if (addresseeId === userId) {
    return NextResponse.json({ error: "You can't send a friend request to yourself" }, { status: 400 });
  }

  const addressee = await prisma.user.findUnique({ where: { id: addresseeId } });
  if (!addressee) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const existing = await prisma.friendship.findFirst({ where: symmetricPairWhere(userId, addresseeId) });

  if (existing) {
    if (existing.status === "ACCEPTED") {
      return NextResponse.json({ error: "Already friends" }, { status: 409 });
    }
    if (existing.status === "PENDING") {
      return NextResponse.json({ error: "A request is already pending" }, { status: 409 });
    }
    // DECLINED — reuse the row rather than creating a new one, which would
    // collide with the unique(requesterId, addresseeId) constraint once the
    // direction flips back.
    const revived = await prisma.friendship.update({
      where: { id: existing.id },
      data: { requesterId: userId, addresseeId, status: "PENDING", respondedAt: null, createdAt: new Date() },
    });
    return NextResponse.json(revived, { status: 201 });
  }

  const created = await prisma.friendship.create({
    data: { requesterId: userId, addresseeId, status: "PENDING" },
  });
  return NextResponse.json(created, { status: 201 });
}
