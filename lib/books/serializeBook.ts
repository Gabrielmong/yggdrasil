/** Prisma `include` fragment for fetching a Book's normalized genre/tag
 * relations, ready for serializeBookTaxonomy. Every route that returns a
 * Book (or a UserBook with a nested `book`) to a client uses this. */
export const BOOK_TAXONOMY_INCLUDE = {
  genreLinks: { select: { genre: { select: { name: true } } } },
  tagLinks: { select: { tag: { select: { name: true } } } },
} as const;

interface BookTaxonomyShape {
  genreLinks: { genre: { name: string } }[];
  tagLinks: { tag: { name: string } }[];
}

/** Flattens a Book's genreLinks/tagLinks relations (fetched via
 * BOOK_TAXONOMY_INCLUDE) into plain `genres`/`tags` name arrays — the
 * public API shape every existing client already expects, unchanged by
 * the underlying migration to normalized entities. If the fetched row
 * still carries the old (now-unused) `genres`/`tags` scalar columns
 * too, those are silently replaced by the derived values below — the
 * explicit properties in the returned object literal win over whatever
 * `...rest` carried in. */
export function serializeBookTaxonomy<T extends BookTaxonomyShape>(
  book: T
): Omit<T, "genreLinks" | "tagLinks"> & { genres: string[]; tags: string[] } {
  const { genreLinks, tagLinks, ...rest } = book;
  return {
    ...rest,
    genres: genreLinks.map((link) => link.genre.name),
    tags: tagLinks.map((link) => link.tag.name),
  } as Omit<T, "genreLinks" | "tagLinks"> & { genres: string[]; tags: string[] };
}
