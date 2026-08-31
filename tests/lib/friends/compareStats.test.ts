import { describe, it, expect } from "vitest";
import { computeCompareStats } from "@/lib/friends/compareStats";

describe("computeCompareStats", () => {
  it("counts genre and author frequency for each side independently", () => {
    const stats = computeCompareStats(
      [{ genres: ["Fantasy"], authors: ["Tolkien"] }, { genres: ["Fantasy", "Classic"], authors: ["Camus"] }],
      [{ genres: ["Fantasy"], authors: ["Tolkien"] }]
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
      [{ genres: ["Rare"], authors: [] }, { genres: ["Common"], authors: [] }],
      [{ genres: ["Common"], authors: [] }, { genres: ["Common"], authors: [] }]
    );

    expect(stats.genres.map((row) => row.name)).toEqual(["Common", "Rare"]);
  });

  it("computes shared genres and authors as a plain intersection", () => {
    const stats = computeCompareStats(
      [{ genres: ["Fantasy", "Horror"], authors: ["Tolkien", "King"] }],
      [{ genres: ["Fantasy", "Sci-Fi"], authors: ["Tolkien", "Asimov"] }]
    );

    expect(stats.sharedGenres).toEqual(["Fantasy"]);
    expect(stats.sharedAuthors).toEqual(["Tolkien"]);
  });

  it("returns empty results when both sides have no books", () => {
    const stats = computeCompareStats([], []);
    expect(stats).toEqual({ genres: [], authors: [], sharedGenres: [], sharedAuthors: [] });
  });

  it("handles one side having no books at all", () => {
    const stats = computeCompareStats([{ genres: ["Fantasy"], authors: ["Tolkien"] }], []);
    expect(stats.genres).toEqual([{ name: "Fantasy", you: 1, friend: 0 }]);
    expect(stats.sharedGenres).toEqual([]);
  });
});
