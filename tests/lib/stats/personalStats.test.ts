import { describe, it, expect } from "vitest";
import { computePersonalStats, type StatsBook } from "@/lib/stats/personalStats";

function book(overrides: Partial<StatsBook> = {}): StatsBook {
  return {
    genres: [],
    authors: [],
    rating: null,
    pageCount: null,
    finishedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "READ",
    ...overrides,
  };
}

describe("computePersonalStats", () => {
  it("returns all-zero/empty stats for no books", () => {
    expect(computePersonalStats([])).toEqual({
      totalBooksRead: 0,
      totalPagesRead: 0,
      genreFrequency: [],
      authorFrequency: [],
      booksOverTime: [],
      avgRatingByGenre: [],
      ratingDistribution: [
        { rating: 1, count: 0 },
        { rating: 2, count: 0 },
        { rating: 3, count: 0 },
        { rating: 4, count: 0 },
        { rating: 5, count: 0 },
      ],
      totalBooksOnShelf: 0,
      distinctAuthorCount: 0,
      distinctGenreCount: 0,
      averageRating: null,
    });
  });

  it("counts totalBooksRead and sums pageCount, treating a missing pageCount as 0", () => {
    const stats = computePersonalStats([book({ pageCount: 200 }), book({ pageCount: null }), book({ pageCount: 150 })]);
    expect(stats.totalBooksRead).toBe(3);
    expect(stats.totalPagesRead).toBe(350);
  });

  it("computes genre and author frequency, sorted descending by count", () => {
    const stats = computePersonalStats([
      book({ genres: ["Fantasy"], authors: ["Tolkien"] }),
      book({ genres: ["Fantasy", "Classic"], authors: ["Camus"] }),
      book({ genres: ["Classic"], authors: ["Tolkien"] }),
    ]);
    expect(stats.genreFrequency).toEqual([
      { name: "Fantasy", count: 2 },
      { name: "Classic", count: 2 },
    ]);
    expect(stats.authorFrequency).toEqual([
      { name: "Tolkien", count: 2 },
      { name: "Camus", count: 1 },
    ]);
    expect(stats.distinctGenreCount).toBe(2);
    expect(stats.distinctAuthorCount).toBe(2);
  });

  it("buckets books over time by finishedAt month, sorted ascending", () => {
    const stats = computePersonalStats([
      book({ finishedAt: "2026-03-15T00:00:00.000Z" }),
      book({ finishedAt: "2026-01-02T00:00:00.000Z" }),
      book({ finishedAt: "2026-03-20T00:00:00.000Z" }),
    ]);
    expect(stats.booksOverTime).toEqual([
      { month: "2026-01", count: 1 },
      { month: "2026-03", count: 2 },
    ]);
  });

  it("falls back to createdAt when finishedAt is missing (e.g. an older book marked Read before finishedAt was auto-filled)", () => {
    const stats = computePersonalStats([
      book({ finishedAt: null, createdAt: "2025-11-05T00:00:00.000Z" }),
      book({ finishedAt: "2026-01-02T00:00:00.000Z", createdAt: "2025-06-01T00:00:00.000Z" }),
    ]);
    expect(stats.booksOverTime).toEqual([
      { month: "2025-11", count: 1 },
      { month: "2026-01", count: 1 },
    ]);
  });

  it("computes average rating per genre, ignoring unrated books", () => {
    const stats = computePersonalStats([
      book({ genres: ["Fantasy"], rating: 5 }),
      book({ genres: ["Fantasy"], rating: 3 }),
      book({ genres: ["Fantasy"], rating: null }),
      book({ genres: ["Horror"], rating: 4 }),
    ]);
    expect(stats.avgRatingByGenre).toEqual(
      expect.arrayContaining([
        { name: "Fantasy", avgRating: 4, count: 2 },
        { name: "Horror", avgRating: 4, count: 1 },
      ])
    );
  });

  it("rounds average rating to one decimal place", () => {
    const stats = computePersonalStats([
      book({ genres: ["Fantasy"], rating: 5 }),
      book({ genres: ["Fantasy"], rating: 4 }),
      book({ genres: ["Fantasy"], rating: 4 }),
    ]);
    expect(stats.avgRatingByGenre).toEqual([{ name: "Fantasy", avgRating: 4.3, count: 3 }]);
  });

  it("computes rating distribution across all five buckets, including zero counts", () => {
    const stats = computePersonalStats([book({ rating: 5 }), book({ rating: 5 }), book({ rating: 3 }), book({ rating: null })]);
    expect(stats.ratingDistribution).toEqual([
      { rating: 1, count: 0 },
      { rating: 2, count: 0 },
      { rating: 3, count: 1 },
      { rating: 4, count: 0 },
      { rating: 5, count: 2 },
    ]);
  });

  it("counts totalBooksOnShelf across every status, while read-only stats stay scoped to READ", () => {
    const stats = computePersonalStats([
      book({ status: "READ", pageCount: 100 }),
      book({ status: "READING", pageCount: 999 }),
      book({ status: "WANT_TO_READ", pageCount: 999 }),
    ]);
    expect(stats.totalBooksOnShelf).toBe(3);
    expect(stats.totalBooksRead).toBe(1);
    expect(stats.totalPagesRead).toBe(100);
  });

  it("computes overall average rating across READ books, ignoring unrated ones", () => {
    const stats = computePersonalStats([book({ rating: 5 }), book({ rating: 4 }), book({ rating: null })]);
    expect(stats.averageRating).toBe(4.5);
  });

  it("returns a null average rating when no READ books are rated", () => {
    const stats = computePersonalStats([book({ rating: null })]);
    expect(stats.averageRating).toBeNull();
  });
});
