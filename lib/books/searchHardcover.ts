import type { BookSearchResult } from "@/lib/books/searchGoogleBooks";

const HARDCOVER_API_URL = "https://api.hardcover.app/v1/graphql";

interface HardcoverSearchItem {
  id?: string | number;
  title?: string;
  author_names?: string[];
  authors?: Array<{ name?: string | null }>;
  isbns?: string[];
  isbn?: string | null;
  image?: { url?: string | null } | null;
  image_url?: string | null;
}

interface HardcoverSearchResponse {
  errors?: Array<{ message?: string }>;
  data?: {
    search?: {
      results?: unknown;
    };
  };
}

function asSearchItems(value: unknown): HardcoverSearchItem[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is HardcoverSearchItem & { document?: HardcoverSearchItem; book?: HardcoverSearchItem } => Boolean(item && typeof item === "object"))
      .map((item) => item.document ?? item.book ?? item);
  }
  if (value && typeof value === "object") {
    const record = value as { results?: unknown; hits?: unknown; documents?: unknown; document?: unknown; book?: unknown };
    return asSearchItems(record.results ?? record.hits ?? record.documents ?? record.document ?? record.book);
  }
  return [];
}

export async function searchHardcover(query: string): Promise<BookSearchResult[]> {
  const token = process.env.HARDCOVER_API_KEY;
  if (!token) return [];

  let response: Response;
  try {
    response = await fetch(HARDCOVER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `
          query SearchBooks($query: String!) {
            search(query: $query, query_type: "books") {
              results
            }
          }
        `,
        variables: { query },
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.error("[searchHardcover] fetch error", error);
    return [];
  }
  
  if (!response.ok) return [];

  const payload = (await response.json()) as HardcoverSearchResponse;
  if (payload.errors?.length) {
    console.error("[searchHardcover] GraphQL errors", payload.errors.map((error) => error.message ?? "Unknown error"));
    return [];
  }

  return asSearchItems(payload.data?.search?.results)
    .map((item): BookSearchResult | null => {
      const title = typeof item.title === "string" ? item.title : "";
      if (!title) return null;
      const authors = Array.isArray(item.author_names)
        ? item.author_names.filter((author): author is string => typeof author === "string")
        : (item.authors ?? []).map((author) => author.name ?? "").filter(Boolean);
      const isbn = Array.isArray(item.isbns)
        ? item.isbns.find((value) => typeof value === "string" && value.length >= 10)
        : typeof item.isbn === "string" && item.isbn.length >= 10
          ? item.isbn
          : undefined;

      return {
        isbn,
        hardcoverId: item.id != null ? String(item.id) : undefined,
        title,
        authors,
        coverUrl: item.image?.url ?? item.image_url ?? null,
        source: "HARDCOVER",
      };
    })
    .filter((item): item is BookSearchResult => item !== null);
}
