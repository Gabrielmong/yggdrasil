import { describe, it, expect } from "vitest";
import { mergeBookData } from "@/lib/books/mergeBookData";

describe("mergeBookData", () => {
  it("returns the Google Books result as-is when it is complete", () => {
    const google = {
      title: "The Hobbit",
      authors: ["J.R.R. Tolkien"],
      description: "A journey.",
      genres: ["Fantasy"],
      pageCount: 310,
      publishedYear: 1937,
      coverUrl: "http://example.com/cover.jpg",
      source: "GOOGLE_BOOKS" as const,
    };

    const result = mergeBookData("9780618260300", google, null);

    expect(result).toEqual({ isbn: "9780618260300", ...google });
  });

  it("fills gaps in Google Books data from Open Library", () => {
    const google = {
      title: "The Hobbit",
      authors: ["J.R.R. Tolkien"],
      description: null,
      genres: [],
      pageCount: null,
      publishedYear: 1937,
      coverUrl: null,
      source: "GOOGLE_BOOKS" as const,
    };
    const openLibrary = {
      title: "The Hobbit",
      authors: ["J.R.R. Tolkien"],
      description: null,
      genres: ["Fantasy fiction"],
      pageCount: 310,
      publishedYear: 1937,
      coverUrl: "http://example.com/ol-cover.jpg",
      source: "OPEN_LIBRARY" as const,
    };

    const result = mergeBookData("9780618260300", google, openLibrary);

    expect(result).toEqual({
      isbn: "9780618260300",
      title: "The Hobbit",
      authors: ["J.R.R. Tolkien"],
      description: null,
      genres: ["Fantasy fiction"],
      pageCount: 310,
      publishedYear: 1937,
      coverUrl: "http://example.com/ol-cover.jpg",
      source: "GOOGLE_BOOKS",
    });
  });

  it("uses Open Library alone when Google Books has no result", () => {
    const openLibrary = {
      title: "The Hobbit",
      authors: ["J.R.R. Tolkien"],
      description: null,
      genres: ["Fantasy fiction"],
      pageCount: 310,
      publishedYear: 1937,
      coverUrl: "http://example.com/ol-cover.jpg",
      source: "OPEN_LIBRARY" as const,
    };

    const result = mergeBookData("9780618260300", null, openLibrary);

    expect(result).toEqual({ isbn: "9780618260300", ...openLibrary });
  });

  it("returns null when neither source has a title", () => {
    const result = mergeBookData("0000000000000", null, null);
    expect(result).toBeNull();
  });

  it("can prefer Hardcover when adding a book", () => {
    const google = { title: "Google title", source: "GOOGLE_BOOKS" as const };
    const hardcover = { title: "Hardcover title", source: "HARDCOVER" as const };

    const result = mergeBookData("9780618260300", google, null, hardcover, "HARDCOVER");

    expect(result).toEqual({
      isbn: "9780618260300",
      title: "Hardcover title",
      authors: [],
      description: null,
      genres: [],
      pageCount: null,
      publishedYear: null,
      coverUrl: null,
      source: "HARDCOVER",
    });
  });
});
