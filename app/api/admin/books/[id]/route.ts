import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth/requireAdmin";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAdmin(await auth());
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const existing = await prisma.book.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.book.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
