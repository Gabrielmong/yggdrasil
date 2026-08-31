import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchFromGoogleBooks } from "@/lib/books/googleBooks";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchFromGoogleBooks", () => {
  it("maps a successful response into partial BookData", async () => {
    const mockResponse = {
      totalItems: 1,
      items: [
        {
          volumeInfo: {
            title: "The Hobbit",
            authors: ["J.R.R. Tolkien"],
            description: "A hobbit's unexpected journey.",
            categories: ["Fiction", "Fantasy"],
            pageCount: 310,
            publishedDate: "1937-09-21",
            imageLinks: { thumbnail: "http://example.com/cover.jpg" },
          },
        },
      ],
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await fetchFromGoogleBooks("9780618260300");

    expect(result).toEqual({
      title: "The Hobbit",
      authors: ["J.R.R. Tolkien"],
      description: "A hobbit's unexpected journey.",
      genres: ["Fiction", "Fantasy"],
      pageCount: 310,
      publishedYear: 1937,
      coverUrl: "http://example.com/cover.jpg",
      source: "GOOGLE_BOOKS",
    });
  });

  it("returns null when there are no results", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ totalItems: 0 }),
    } as Response);

    const result = await fetchFromGoogleBooks("0000000000000");
    expect(result).toBeNull();
  });

  it("returns null when the request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as Response);
    const result = await fetchFromGoogleBooks("9780618260300");
    expect(result).toBeNull();
  });
});
