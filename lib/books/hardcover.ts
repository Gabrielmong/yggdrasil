import type { BookData } from "@/lib/books/types";

const HARDCOVER_API_URL = "https://api.hardcover.app/v1/graphql";

interface HardcoverBook {
  title?: string;
  description?: string | null;
  pages?: number | null;
  release_date?: string | null;
  image?: { url?: string | null } | null;
  contributions?: Array<{ author?: { name?: string | null } | null }>;
  genres?: Array<{ name?: string | null }>;
}

interface HardcoverResponse {
  data?: { books?: HardcoverBook[] };
}

const BOOK_FIELDS = `
  title
  description
  pages
  release_date
  image { url }
  contributions { author { name } }
  genres { name }
`;

async function fetchBook(variables: Record<string, string>, query: string): Promise<Partial<BookData> | null> {
  const token = process.env.HARDCOVER_API_KEY;
  if (!token) return null;

  let response: Response;
  try {
    response = await fetch(HARDCOVER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const payload = (await response.json()) as HardcoverResponse;
  const book = payload.data?.books?.[0];
  if (!book?.title) return null;

  const publishedYear = book.release_date ? Number.parseInt(book.release_date.slice(0, 4), 10) : null;
  return {
    title: book.title,
    authors: (book.contributions ?? [])
      .map((contribution) => contribution.author?.name ?? "")
      .filter(Boolean),
    description: book.description ?? null,
    genres: (book.genres ?? []).map((genre) => genre.name ?? "").filter(Boolean),
    pageCount: book.pages ?? null,
    publishedYear: Number.isNaN(publishedYear) ? null : publishedYear,
    coverUrl: book.image?.url ?? null,
    source: "HARDCOVER",
  };
}

export function fetchFromHardcover(isbn: string): Promise<Partial<BookData> | null> {
  return fetchBook(
    { isbn },
    `query BookByIsbn($isbn: String!) {
      books(where: { isbns: { _contains: [$isbn] } }, limit: 1) {
        ${BOOK_FIELDS}
      }
    }`,
  );
}

export function fetchFromHardcoverById(id: string): Promise<Partial<BookData> | null> {
  return fetchBook(
    { id },
    `query BookById($id: ID!) {
      books(where: { id: { _eq: $id } }, limit: 1) {
        ${BOOK_FIELDS}
      }
    }`,
  );
}
