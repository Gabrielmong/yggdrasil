import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth/requireAdmin";

const ADMIN_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
  avatarImageId: true,
  createdAt: true,
  role: true,
  active: true,
  _count: { select: { userBooks: true } },
} as const;

export async function GET(request: Request) {
  const guard = requireAdmin(await auth());
  if (!guard.ok) return guard.response;

  const q = new URL(request.url).searchParams.get("q")?.trim();

  const users = await prisma.user.findMany({
    where: q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }
      : undefined,
    select: ADMIN_USER_SELECT,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(users);
}
