import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { BOOK_TAXONOMY_INCLUDE, serializeBookTaxonomy } from "@/lib/books/serializeBook";

export async function GET(request: Request) {
  const guard = requireAdmin(await auth());
  if (!guard.ok) return guard.response;

  const q = new URL(request.url).searchParams.get("q")?.trim().toLowerCase();

  const books = await prisma.book.findMany({
    include: { ...BOOK_TAXONOMY_INCLUDE, _count: { select: { userBooks: true } } },
    orderBy: { fetchedAt: "desc" },
  });

  const serialized = books.map(serializeBookTaxonomy);

  // authors is a String[]; Prisma can't substring-match inside it, so the
  // author part of the search is filtered here in application code —
  // fine at this app's scale (same tradeoff other full-shelf computations
  // in this codebase already make, e.g. lib/friends/compareStats.ts).
  const filtered = q
    ? serialized.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.isbn.toLowerCase().includes(q) ||
          b.authors.some((a) => a.toLowerCase().includes(q))
      )
    : serialized;

  return NextResponse.json(filtered);
}
