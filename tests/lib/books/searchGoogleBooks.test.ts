import { describe, it, expect, vi, afterEach } from "vitest";
import { matchesSearchQuery, normalizeSearchText } from "@/lib/books/searchUtils";
import { searchGoogleBooks } from "@/lib/books/searchGoogleBooks";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("searchGoogleBooks", () => {
  it("keeps results with ISBN_13 and also preserves volume IDs when ISBN metadata is missing", async () => {
    const mockResponse = {
      totalItems: 2,
      items: [
        {
          id: "google-volume-1",
          volumeInfo: {
            title: "The Hobbit",
            authors: ["J.R.R. Tolkien"],
            imageLinks: { thumbnail: "http://example.com/cover.jpg" },
            industryIdentifiers: [
              { type: "ISBN_10", identifier: "0618260307" },
              { type: "ISBN_13", identifier: "9780618260300" },
            ],
          },
        },
        {
          id: "google-volume-2",
          volumeInfo: {
            title: "The Hobbit (audio edition)",
            authors: ["J.R.R. Tolkien"],
            industryIdentifiers: [{ type: "OTHER", identifier: "some-audio-id" }],
          },
        },
      ],
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const results = await searchGoogleBooks("the hobbit");

    expect(results).toEqual([
      {
        isbn: "9780618260300",
        googleId: "google-volume-1",
        title: "The Hobbit",
        authors: ["J.R.R. Tolkien"],
        coverUrl: "http://example.com/cover.jpg",
        source: "GOOGLE_BOOKS",
      },
      {
        isbn: undefined,
        googleId: "google-volume-2",
        title: "The Hobbit (audio edition)",
        authors: ["J.R.R. Tolkien"],
        coverUrl: null,
        source: "GOOGLE_BOOKS",
      },
    ]);
  });

  it("accepts ISBN_10 results when ISBN_13 is missing", async () => {
    const mockResponse = {
      totalItems: 1,
      items: [
        {
          volumeInfo: {
            title: "Dune",
            authors: ["Frank Herbert"],
            industryIdentifiers: [{ type: "ISBN_10", identifier: "0441172717" }],
          },
        },
      ],
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    await expect(searchGoogleBooks("dune")).resolves.toEqual([
      {
        isbn: "0441172717",
        title: "Dune",
        authors: ["Frank Herbert"],
        coverUrl: null,
        source: "GOOGLE_BOOKS",
      },
    ]);
  });

  it("keeps generic title/author matches even when they have no ISBN", async () => {
    const mockResponse = {
      totalItems: 1,
      items: [
        {
          id: "google-book-123",
          volumeInfo: {
            title: "Myth and Meaning",
            authors: ["Jane Doe"],
          },
        },
      ],
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    await expect(searchGoogleBooks("myth")).resolves.toEqual([
      {
        isbn: undefined,
        googleId: "google-book-123",
        title: "Myth and Meaning",
        authors: ["Jane Doe"],
        coverUrl: null,
        source: "GOOGLE_BOOKS",
      },
    ]);
  });

  it("normalizes punctuation and matches title/author tokens loosely", () => {
    expect(
      matchesSearchQuery(normalizeSearchText("myth & meaning"), {
        title: "Myth & Meaning",
        authors: ["Jane Doe"],
      })
    ).toBe(true);

    expect(
      matchesSearchQuery(normalizeSearchText("hp lovecraft"), {
        title: "The Call of Cthulhu",
        authors: ["H. P. Lovecraft"],
      })
    ).toBe(true);

    expect(
      matchesSearchQuery(normalizeSearchText("mystery novel"), {
        title: "The Myth of Sisyphus",
        authors: ["Camus"],
      })
    ).toBe(false);
  });

  it("returns an empty array when there are no results", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ totalItems: 0 }),
    } as Response);

    expect(await searchGoogleBooks("nonexistent query")).toEqual([]);
  });

  it("returns an empty array when the request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as Response);
    expect(await searchGoogleBooks("the hobbit")).toEqual([]);
  });

  it("returns an empty array when the request throws (network error)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    expect(await searchGoogleBooks("the hobbit")).toEqual([]);
  });
});
