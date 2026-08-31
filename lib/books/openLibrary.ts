import type { BookData } from "@/lib/books/types";

export async function fetchFromOpenLibrary(isbn: string): Promise<Partial<BookData> | null> {
  let response: Response;
  try {
    response = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&jscmd=data&format=json`,
      { signal: AbortSignal.timeout(5000) }
    );
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const data = await response.json();
  const entry = data[`ISBN:${isbn}`];
  if (!entry) return null;

  const publishedYear = entry.publish_date ? parseInt(entry.publish_date.slice(-4), 10) : null;

  return {
    title: entry.title ?? undefined,
    authors: (entry.authors ?? []).map((a: { name: string }) => a.name),
    description: null,
    genres: (entry.subjects ?? []).map((s: { name: string }) => s.name),
    pageCount: entry.number_of_pages ?? null,
    publishedYear: Number.isNaN(publishedYear) ? null : publishedYear,
    coverUrl: entry.cover?.medium ?? entry.cover?.large ?? null,
    source: "OPEN_LIBRARY",
  };
}
