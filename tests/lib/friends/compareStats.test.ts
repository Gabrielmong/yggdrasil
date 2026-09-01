import { describe, it, expect } from "vitest";
import { computeCompareStats, type CompareBookInput } from "@/lib/friends/compareStats";

function book(overrides: Partial<CompareBookInput> = {}): CompareBookInput {
  return {
    bookId: "book-id",
    title: "Untitled",
    authors: [],
    genres: [],
    coverUrl: null,
    coverImageId: null,
    rating: null,
    ...overrides,
  };
}

describe("computeCompareStats", () => {
  it("counts genre and author frequency for each side independently", () => {
    const stats = computeCompareStats(
      [book({ genres: ["Fantasy"], authors: ["Tolkien"] }), book({ genres: ["Fantasy", "Classic"], authors: ["Camus"] })],
      [book({ genres: ["Fantasy"], authors: ["Tolkien"] })]
    );

    expect(stats.genres).toEqual(
      expect.arrayContaining([
        { name: "Fantasy", you: 2, friend: 1 },
        { name: "Classic", you: 1, friend: 0 },
      ])
    );
    expect(stats.authors).toEqual(
      expect.arrayContaining([
        { name: "Tolkien", you: 1, friend: 1 },
        { name: "Camus", you: 1, friend: 0 },
      ])
    );
  });

  it("sorts rows by combined count, highest first", () => {
    const stats = computeCompareStats(
      [book({ genres: ["Rare"] }), book({ genres: ["Common"] })],
      [book({ genres: ["Common"] }), book({ genres: ["Common"] })]
    );

    expect(stats.genres.map((row) => row.name)).toEqual(["Common", "Rare"]);
  });

  it("computes shared genres/authors as an intersection, and each side's exclusive genres/authors as the complement", () => {
    const stats = computeCompareStats(
      [book({ genres: ["Fantasy", "Horror"], authors: ["Tolkien", "King"] })],
      [book({ genres: ["Fantasy", "Sci-Fi"], authors: ["Tolkien", "Asimov"] })]
    );

    expect(stats.sharedGenres).toEqual(["Fantasy"]);
    expect(stats.sharedAuthors).toEqual(["Tolkien"]);
    expect(stats.yourOnlyGenres).toEqual(["Horror"]);
    expect(stats.friendOnlyGenres).toEqual(["Sci-Fi"]);
    expect(stats.yourOnlyAuthors).toEqual(["King"]);
    expect(stats.friendOnlyAuthors).toEqual(["Asimov"]);
  });

  it("returns empty results and a null compatibility score when both sides have no books", () => {
    const stats = computeCompareStats([], []);
    expect(stats).toEqual({
      genres: [],
      authors: [],
      sharedGenres: [],
      sharedAuthors: [],
      yourOnlyGenres: [],
      friendOnlyGenres: [],
      yourOnlyAuthors: [],
      friendOnlyAuthors: [],
      compatibilityScore: null,
      sharedBooks: [],
      recommendations: [],
    });
  });

  it("handles one side having no books at all", () => {
    const stats = computeCompareStats([book({ genres: ["Fantasy"], authors: ["Tolkien"] })], []);
    expect(stats.genres).toEqual([{ name: "Fantasy", you: 1, friend: 0 }]);
    expect(stats.sharedGenres).toEqual([]);
  });

  it("computes a 100 compatibility score for identical genre/author sets", () => {
    const stats = computeCompareStats(
      [book({ genres: ["Fantasy"], authors: ["Tolkien"] })],
      [book({ genres: ["Fantasy"], authors: ["Tolkien"] })]
    );
    expect(stats.compatibilityScore).toBe(100);
  });

  it("computes a partial compatibility score as the Jaccard similarity of combined genre+author sets", () => {
    // your set: {g:Fantasy, g:Horror, a:Tolkien} — friend set: {g:Fantasy, a:Tolkien}
    // intersection = 2 (g:Fantasy, a:Tolkien), union = 3 -> round(2/3*100) = 67
    const stats = computeCompareStats(
      [book({ genres: ["Fantasy", "Horror"], authors: ["Tolkien"] })],
      [book({ genres: ["Fantasy"], authors: ["Tolkien"] })]
    );
    expect(stats.compatibilityScore).toBe(67);
  });

  it("lists books both sides have read, with each side's rating", () => {
    const stats = computeCompareStats(
      [book({ bookId: "b1", title: "Dune", rating: 5 }), book({ bookId: "b2", title: "Solo read", rating: 3 })],
      [book({ bookId: "b1", title: "Dune", rating: 4 })]
    );
    expect(stats.sharedBooks).toEqual([
      { bookId: "b1", title: "Dune", coverUrl: null, coverImageId: null, yourRating: 5, friendRating: 4 },
    ]);
  });

  it("recommends friend's books you don't have, ranked by matching your genre frequency", () => {
    const stats = computeCompareStats(
      [book({ bookId: "y1", genres: ["Fantasy"] }), book({ bookId: "y2", genres: ["Fantasy"] })],
      [
        book({ bookId: "f1", title: "High match", genres: ["Fantasy"], rating: 4 }),
        book({ bookId: "f2", title: "No match", genres: ["Sci-Fi"], rating: 5 }),
      ],
      new Set(["y1", "y2"])
    );
    expect(stats.recommendations.map((r) => r.title)).toEqual(["High match", "No match"]);
  });

  it("excludes books already on your shelf (any status) from recommendations", () => {
    const stats = computeCompareStats(
      [book({ bookId: "y1" })],
      [book({ bookId: "y1", title: "Already have it" }), book({ bookId: "f1", title: "New to you" })],
      new Set(["y1"])
    );
    expect(stats.recommendations.map((r) => r.title)).toEqual(["New to you"]);
  });
});
