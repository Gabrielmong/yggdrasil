import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchFromOpenLibrary } from "@/lib/books/openLibrary";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchFromOpenLibrary", () => {
  it("maps a successful response into partial BookData", async () => {
    const isbn = "9780618260300";
    const mockResponse = {
      [`ISBN:${isbn}`]: {
        title: "The Hobbit",
        authors: [{ name: "J.R.R. Tolkien" }],
        subjects: [{ name: "Fantasy fiction" }],
        number_of_pages: 310,
        publish_date: "1937",
        cover: { medium: "http://example.com/ol-cover.jpg" },
      },
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await fetchFromOpenLibrary(isbn);

    expect(result).toEqual({
      title: "The Hobbit",
      authors: ["J.R.R. Tolkien"],
      description: null,
      genres: ["Fantasy fiction"],
      pageCount: 310,
      publishedYear: 1937,
      coverUrl: "http://example.com/ol-cover.jpg",
      source: "OPEN_LIBRARY",
    });
  });

  it("returns null when the ISBN key is absent", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    const result = await fetchFromOpenLibrary("0000000000000");
    expect(result).toBeNull();
  });

  it("returns null when the request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as Response);
    const result = await fetchFromOpenLibrary("9780618260300");
    expect(result).toBeNull();
  });
});
