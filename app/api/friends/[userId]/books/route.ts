import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isActiveFriend } from "@/lib/friends/isActiveFriend";

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { userId } = await params;

  if (!(await isActiveFriend(session.user.id, userId))) {
    return NextResponse.json({ error: "Not friends" }, { status: 403 });
  }

  const userBooks = await prisma.userBook.findMany({
    where: { userId },
    select: {
      id: true,
      status: true,
      rating: true,
      book: {
        select: {
          id: true,
          title: true,
          authors: true,
          coverUrl: true,
          coverImageId: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(userBooks);
}
