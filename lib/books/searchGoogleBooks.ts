export interface BookSearchResult {
  isbn?: string;
  googleId?: string;
  hardcoverId?: string;
  source?: "GOOGLE_BOOKS" | "OPEN_LIBRARY" | "HARDCOVER";
  title: string;
  authors: string[];
  coverUrl: string | null;
}

/** Status codes worth a second attempt: rate limiting (429) and Google's own
 * transient server errors (5xx) — both have been observed to resolve on an
 * immediate retry, most often when this call runs concurrently with the
 * Open Library and Hardcover calls in the "all sources" search. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Free-text title/author search against Google Books. Prefer ISBN-based
 * identifiers when available, but keep results that only have a Google volume ID,
 * since broad title/author searches often return those. Retries once on
 * rate limiting, transient server errors, and network failures/timeouts.
 */
export async function searchGoogleBooks(query: string): Promise<BookSearchResult[]> {
  let response: Response | undefined;
  let lastError: unknown;

  const keyParam = process.env.GOOGLE_BOOKS_API_KEY ? `&key=${process.env.GOOGLE_BOOKS_API_KEY}` : "";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}${keyParam}`,
        { signal: AbortSignal.timeout(5000) }
      );
      lastError = undefined;
      if (response.ok || !isRetryableStatus(response.status)) break;
    } catch (error) {
      response = undefined;
      lastError = error;
    }
  }

  if (lastError) {
    console.error("[searchGoogleBooks] fetch error", lastError);
    return [];
  }
  if (!response || !response.ok) {
    if (response) console.error("[searchGoogleBooks] non-ok response", response.status);
    return [];
  }

  const data = await response.json();
  if (!data.totalItems || !data.items?.length) return [];

  const results: BookSearchResult[] = [];
  for (const item of data.items) {
    const info = item.volumeInfo ?? {};
    if (!info.title) continue;

    const identifiers = info.industryIdentifiers ?? [];
    const isbn =
      identifiers.find((id: { type: string; identifier: string }) => id.type === "ISBN_13")?.identifier ??
      identifiers.find((id: { type: string; identifier: string }) => id.type === "ISBN_10")?.identifier;

    results.push({
      isbn: isbn ?? undefined,
      googleId: item.id ?? undefined,
      title: info.title,
      authors: info.authors ?? [],
      coverUrl: info.imageLinks?.thumbnail ?? null,
      source: "GOOGLE_BOOKS",
    });
  }
  return results;
}
