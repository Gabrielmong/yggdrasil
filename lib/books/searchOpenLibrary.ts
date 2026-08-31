import type { BookSearchResult } from "@/lib/books/searchGoogleBooks";

/**
 * Free-text title/author search against Open Library. Used as a fallback when
 * Google Books returns no useful matches for a broad search term.
 */
export async function searchOpenLibrary(query: string): Promise<BookSearchResult[]> {
  try {
    const response = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=10&fields=key,title,author_name,isbn,cover_i`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) return [];

    const data = await response.json();
    const docs = Array.isArray(data.docs) ? data.docs : [];

    return docs
      .map((doc: Record<string, unknown>) => {
        const title = typeof doc.title === "string" ? doc.title : "";
        if (!title) return null;

        const authors = Array.isArray(doc.author_name)
          ? doc.author_name.filter((value): value is string => typeof value === "string")
          : [];

        const isbnValue = Array.isArray(doc.isbn)
          ? doc.isbn.find((value): value is string => typeof value === "string" && value.length >= 10)
          : typeof doc.isbn === "string" && doc.isbn.length >= 10
            ? doc.isbn
            : undefined;

        const coverI = typeof doc.cover_i === "number" ? doc.cover_i : undefined;
        const coverUrl = coverI ? `https://covers.openlibrary.org/b/id/${coverI}-M.jpg` : null;

        return {
          isbn: isbnValue,
          googleId: undefined,
          title,
          authors,
          coverUrl,
          source: "OPEN_LIBRARY",
        } satisfies BookSearchResult;
      })
      .filter((item: BookSearchResult | null): item is BookSearchResult => item !== null);
  } catch {
    return [];
  }
}
