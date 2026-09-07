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

  // No email here — another user's email address should only ever be
  // visible on their own profile page, never on a friend's page.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, image: true, avatarImageId: true, createdAt: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Not friends" }, { status: 403 });
  }

  return NextResponse.json(user);
}
