import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userBooks = await prisma.userBook.findMany({
    where: { userId: session.user.id },
    include: { book: true },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(userBooks);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bookId, status } = await request.json();
  if (!bookId || !status) {
    return NextResponse.json({ error: "bookId and status are required" }, { status: 400 });
  }

  const existing = await prisma.userBook.findUnique({
    where: { userId_bookId: { userId: session.user.id, bookId } },
    include: { book: true },
  });
  if (existing) {
    return NextResponse.json(existing);
  }

  const userBook = await prisma.userBook.create({
    data: { userId: session.user.id, bookId, status },
    include: { book: true },
  });

  return NextResponse.json(userBook, { status: 201 });
}
