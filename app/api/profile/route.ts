import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isValidImageId } from "@/lib/storage/isValidImageId";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, image: true, avatarImageId: true, createdAt: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(user);
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { avatarImageId } = await request.json();
  if (typeof avatarImageId !== "string" || !isValidImageId(avatarImageId)) {
    return NextResponse.json({ error: "avatarImageId must be a valid uuid" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { avatarImageId },
    select: { id: true, name: true, email: true, image: true, avatarImageId: true, createdAt: true },
  });

  return NextResponse.json(user);
}
