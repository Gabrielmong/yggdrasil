import { describe, it, expect } from "vitest";
import { serializeBookTaxonomy } from "@/lib/books/serializeBook";

describe("serializeBookTaxonomy", () => {
  it("flattens genreLinks/tagLinks into name arrays, preserving other fields", () => {
    const book = {
      id: "book-1",
      title: "The Myth of Sisyphus",
      genreLinks: [{ genre: { name: "Philosophy" } }, { genre: { name: "Essays" } }],
      tagLinks: [{ tag: { name: "existentialism" } }],
    };

    expect(serializeBookTaxonomy(book)).toEqual({
      id: "book-1",
      title: "The Myth of Sisyphus",
      genres: ["Philosophy", "Essays"],
      tags: ["existentialism"],
    });
  });

  it("returns empty arrays for a book with no genres or tags", () => {
    const book = { id: "book-2", title: "Untagged", genreLinks: [], tagLinks: [] };

    expect(serializeBookTaxonomy(book)).toEqual({ id: "book-2", title: "Untagged", genres: [], tags: [] });
  });

  it("does not mutate the input object", () => {
    const book = { id: "book-3", genreLinks: [{ genre: { name: "Fiction" } }], tagLinks: [] };
    serializeBookTaxonomy(book);
    expect(book).toHaveProperty("genreLinks");
  });
});
