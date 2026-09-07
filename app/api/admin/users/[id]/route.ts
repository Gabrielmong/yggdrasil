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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAdmin(await auth());
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (id === guard.userId) {
    return NextResponse.json({ error: "You can't change your own account from here" }, { status: 400 });
  }

  const { role, active } = await request.json();
  if (role !== undefined && role !== "USER" && role !== "ADMIN") {
    return NextResponse.json({ error: "role must be USER or ADMIN" }, { status: 400 });
  }
  if (active !== undefined && typeof active !== "boolean") {
    return NextResponse.json({ error: "active must be a boolean" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(role !== undefined && { role }),
      ...(active !== undefined && { active }),
    },
    select: ADMIN_USER_SELECT,
  });

  return NextResponse.json(updated);
}
