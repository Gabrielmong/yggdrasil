import type { BookData } from "@/lib/books/types";

export async function fetchFromGoogleBooks(
  identifier: string,
  mode: "isbn" | "id" = "isbn"
): Promise<Partial<BookData> | null> {
  let response: Response;
  try {
    const query = mode === "id" ? `id:${encodeURIComponent(identifier)}` : `isbn:${encodeURIComponent(identifier)}`;
    const keyParam = process.env.GOOGLE_BOOKS_API_KEY ? `&key=${process.env.GOOGLE_BOOKS_API_KEY}` : "";
    response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}${keyParam}`, {
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const data = await response.json();
  if (!data.totalItems || !data.items?.length) return null;

  const info = data.items[0].volumeInfo ?? {};
  const publishedYear = info.publishedDate ? parseInt(info.publishedDate.slice(0, 4), 10) : null;

  return {
    title: info.title ?? undefined,
    authors: info.authors ?? [],
    description: info.description ?? null,
    genres: info.categories ?? [],
    pageCount: info.pageCount ?? null,
    publishedYear: Number.isNaN(publishedYear) ? null : publishedYear,
    coverUrl: info.imageLinks?.thumbnail ?? null,
    source: "GOOGLE_BOOKS",
  };
}
