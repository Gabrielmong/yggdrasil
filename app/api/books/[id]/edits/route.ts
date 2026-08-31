import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const edits = await prisma.bookEdit.findMany({
    where: { bookId: id },
    orderBy: { editedAt: "desc" },
    include: { editedBy: { select: { name: true, image: true } } },
  });

  return NextResponse.json(edits);
}
