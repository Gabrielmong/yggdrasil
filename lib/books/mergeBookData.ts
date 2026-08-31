import type { BookData } from "@/lib/books/types";

export function mergeBookData(
  isbn: string,
  google: Partial<BookData> | null,
  openLibrary: Partial<BookData> | null,
  hardcover: Partial<BookData> | null = null,
  preferredSource?: BookData["source"]
): BookData | null {
  const sources = { GOOGLE_BOOKS: google, OPEN_LIBRARY: openLibrary, HARDCOVER: hardcover } as const;
  const preferred = preferredSource ? sources[preferredSource as keyof typeof sources] : null;
  const primary = preferred?.title ? preferred : google?.title ? google : openLibrary?.title ? openLibrary : hardcover?.title ? hardcover : null;
  if (!primary) return null;

  const providers = [google, openLibrary, hardcover].filter(
    (provider): provider is Partial<BookData> => Boolean(provider && provider !== primary)
  );

  return {
    isbn,
    title: primary.title!,
    authors: nonEmpty(primary.authors) ?? firstNonEmpty(providers, "authors") ?? [],
    description: primary.description ?? firstValue(providers, "description") ?? null,
    genres: nonEmpty(primary.genres) ?? firstNonEmpty(providers, "genres") ?? [],
    pageCount: primary.pageCount ?? firstValue(providers, "pageCount") ?? null,
    publishedYear: primary.publishedYear ?? firstValue(providers, "publishedYear") ?? null,
    coverUrl: primary.coverUrl ?? firstValue(providers, "coverUrl") ?? null,
    source: primary.source!,
  };
}

function nonEmpty<T>(arr: T[] | undefined): T[] | undefined {
  return arr && arr.length > 0 ? arr : undefined;
}

function firstNonEmpty(providers: Partial<BookData>[], field: "authors" | "genres") {
  for (const provider of providers) {
    const value = nonEmpty(provider[field]);
    if (value) return value;
  }
  return undefined;
}

function firstValue<T extends "description" | "pageCount" | "publishedYear" | "coverUrl">(providers: Partial<BookData>[], field: T) {
  for (const provider of providers) {
    if (provider[field] != null) return provider[field];
  }
  return undefined;
}
