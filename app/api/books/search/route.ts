import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchGoogleBooks } from "@/lib/books/searchGoogleBooks";
import { searchOpenLibrary } from "@/lib/books/searchOpenLibrary";
import { searchHardcover } from "@/lib/books/searchHardcover";
import { matchesSearchQuery, normalizeSearchText, scoreSearchResult } from "@/lib/books/searchUtils";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title")?.trim();
  const author = searchParams.get("author")?.trim();
  const query = searchParams.get("q")?.trim();
  const sourceParam = searchParams.get("source");
  const source: "all" | "google" | "openlibrary" | "hardcover" =
    sourceParam === "google" || sourceParam === "openlibrary" || sourceParam === "hardcover" ? sourceParam : "all";

  const effectiveQuery = [title, author].filter(Boolean).join(" ") || query;
  if (!effectiveQuery) {
    return NextResponse.json({ error: "title, author, or q query parameter is required" }, { status: 400 });
  }

  // A single-provider request skips the other two calls entirely and returns
  // that provider's results as-is, with no merge/score/dedup — useful for
  // comparing providers directly (e.g. when one is silently returning nothing).
  if (source !== "all") {
    const results =
      source === "google"
        ? await searchGoogleBooks(effectiveQuery)
        : source === "openlibrary"
          ? await searchOpenLibrary(effectiveQuery)
          : await searchHardcover(effectiveQuery);
    return NextResponse.json(results);
  }

  const normalizedQuery = normalizeSearchText(effectiveQuery);
  const [googleResults, openLibraryResults, hardcoverResults] = await Promise.all([
    searchGoogleBooks(effectiveQuery),
    searchOpenLibrary(effectiveQuery),
    searchHardcover(effectiveQuery),
  ]);

  console.info("[books/search] provider results", {
    googleBooks: googleResults.length,
    openLibrary: openLibraryResults.length,
    hardcover: hardcoverResults.length,
  });

  const merged = [...hardcoverResults, ...googleResults, ...openLibraryResults]
    .filter((result) => matchesSearchQuery(normalizedQuery, result));

  const deduped = merged.filter((result, index, array) => {
    const key = result.googleId ?? result.hardcoverId ?? result.isbn ?? result.title;
    return array.findIndex((candidate) => (candidate.googleId ?? candidate.hardcoverId ?? candidate.isbn ?? candidate.title) === key) === index;
  });

  const sorted = deduped.sort((a, b) => {
    const hardcoverPriority = Number(Boolean(b.hardcoverId)) - Number(Boolean(a.hardcoverId));
    return hardcoverPriority || scoreSearchResult(normalizedQuery, b) - scoreSearchResult(normalizedQuery, a);
  });


  return NextResponse.json(sorted);
}
