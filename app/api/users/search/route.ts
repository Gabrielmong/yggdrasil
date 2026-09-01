import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import type { FriendshipStatus } from "@prisma/client";

type Relationship = "NONE" | "PENDING_OUTGOING" | "PENDING_INCOMING" | "FRIENDS";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json([]);
  }

  const users = await prisma.user.findMany({
    where: {
      id: { not: userId },
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
    // email is matched against above but never returned — another user's
    // email address should only ever be visible on their own profile page.
    select: { id: true, name: true, image: true, avatarImageId: true },
    take: 20,
  });

  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [
        { requesterId: userId, addresseeId: { in: users.map((u) => u.id) } },
        { addresseeId: userId, requesterId: { in: users.map((u) => u.id) } },
      ],
    },
  });

  function relationshipFor(otherId: string): Relationship {
    const row = friendships.find((f) => f.requesterId === otherId || f.addresseeId === otherId);
    if (!row) return "NONE";
    const status: FriendshipStatus = row.status;
    if (status === "ACCEPTED") return "FRIENDS";
    if (status === "DECLINED") return "NONE"; // a declined request can be re-sent
    return row.requesterId === userId ? "PENDING_OUTGOING" : "PENDING_INCOMING";
  }

  const results = users.map((u) => ({ ...u, relationship: relationshipFor(u.id) }));
  return NextResponse.json(results);
}
