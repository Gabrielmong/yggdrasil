import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFromHardcover } from "@/lib/books/hardcover";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.HARDCOVER_API_KEY;
});

describe("fetchFromHardcover", () => {
  it("maps a book response into partial BookData", async () => {
    process.env.HARDCOVER_API_KEY = "test-token";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          books: [
            {
              title: "The Hobbit",
              description: "A hobbit's unexpected journey.",
              pages: 310,
              release_date: "1937-09-21",
              image: { url: "https://example.com/cover.jpg" },
              contributions: [{ author: { name: "J.R.R. Tolkien" } }],
              genres: [{ name: "Fantasy" }],
            },
          ],
        },
      }),
    } as Response);

    await expect(fetchFromHardcover("9780618260300")).resolves.toEqual({
      title: "The Hobbit",
      authors: ["J.R.R. Tolkien"],
      description: "A hobbit's unexpected journey.",
      genres: ["Fantasy"],
      pageCount: 310,
      publishedYear: 1937,
      coverUrl: "https://example.com/cover.jpg",
      source: "HARDCOVER",
    });
  });

  it("does not call the API without a token", async () => {
    global.fetch = vi.fn();

    await expect(fetchFromHardcover("9780618260300")).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
