export interface CompareBookInput {
  bookId: string;
  title: string;
  authors: string[];
  genres: string[];
  coverUrl: string | null;
  coverImageId: string | null;
  rating: number | null;
}

export interface CompareRow {
  name: string;
  you: number;
  friend: number;
}

export interface SharedBookRow {
  bookId: string;
  title: string;
  coverUrl: string | null;
  coverImageId: string | null;
  yourRating: number | null;
  friendRating: number | null;
}

export interface RecommendedBookRow {
  bookId: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  coverImageId: string | null;
  friendRating: number | null;
  /** Sum of your genre-frequency counts across this book's genres — higher
   * means it leans further into genres you already read a lot of. Not
   * shown to the user directly, just used to rank the list. */
  matchScore: number;
}

export interface CompareStats {
  genres: CompareRow[];
  authors: CompareRow[];
  sharedGenres: string[];
  sharedAuthors: string[];
  /** Genres/authors present on your side but absent from your friend's,
   * and vice versa — the complement of sharedGenres/sharedAuthors. */
  yourOnlyGenres: string[];
  friendOnlyGenres: string[];
  yourOnlyAuthors: string[];
  friendOnlyAuthors: string[];
  /** 0-100 headline "match" number: the Jaccard similarity of the two
   * sides' combined genre+author sets. Null when neither side has read
   * anything with a genre or author yet (nothing to compare). */
  compatibilityScore: number | null;
  /** Books both of you have actually marked Read, with each side's rating. */
  sharedBooks: SharedBookRow[];
  /** Books your friend has read that aren't on your shelf at all, ranked
   * by how well they match the genres you already read a lot of. */
  recommendations: RecommendedBookRow[];
}

function frequency(books: CompareBookInput[], field: "genres" | "authors"): Map<string, number> {
  const counts = new Map<string, number>();
  for (const book of books) {
    for (const value of book[field]) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return counts;
}

function mergeRows(you: Map<string, number>, friend: Map<string, number>): CompareRow[] {
  const names = new Set([...you.keys(), ...friend.keys()]);
  return [...names]
    .map((name) => ({ name, you: you.get(name) ?? 0, friend: friend.get(name) ?? 0 }))
    .sort((a, b) => b.you + b.friend - (a.you + a.friend));
}

function onlyInFirst(a: Map<string, number>, b: Map<string, number>): string[] {
  return [...a.keys()].filter((name) => !b.has(name));
}

function namespaced(map: Map<string, number>, prefix: string): Set<string> {
  return new Set([...map.keys()].map((name) => `${prefix}:${name}`));
}

function computeCompatibilityScore(
  yourGenres: Map<string, number>,
  friendGenres: Map<string, number>,
  yourAuthors: Map<string, number>,
  friendAuthors: Map<string, number>
): number | null {
  const yourSet = new Set([...namespaced(yourGenres, "g"), ...namespaced(yourAuthors, "a")]);
  const friendSet = new Set([...namespaced(friendGenres, "g"), ...namespaced(friendAuthors, "a")]);
  const union = new Set([...yourSet, ...friendSet]);
  if (union.size === 0) return null;

  let intersectionSize = 0;
  for (const value of yourSet) {
    if (friendSet.has(value)) intersectionSize += 1;
  }
  return Math.round((intersectionSize / union.size) * 100);
}

function computeSharedBooks(yourBooks: CompareBookInput[], friendBooks: CompareBookInput[]): SharedBookRow[] {
  const friendById = new Map(friendBooks.map((book) => [book.bookId, book]));
  const rows: SharedBookRow[] = [];
  for (const yours of yourBooks) {
    const friend = friendById.get(yours.bookId);
    if (!friend) continue;
    rows.push({
      bookId: yours.bookId,
      title: yours.title,
      coverUrl: yours.coverUrl,
      coverImageId: yours.coverImageId,
      yourRating: yours.rating,
      friendRating: friend.rating,
    });
  }
  return rows.sort((a, b) => a.title.localeCompare(b.title));
}

const MAX_RECOMMENDATIONS = 8;

function computeRecommendations(
  friendBooks: CompareBookInput[],
  yourShelfBookIds: Set<string>,
  yourGenres: Map<string, number>
): RecommendedBookRow[] {
  const seen = new Set<string>();
  const rows: RecommendedBookRow[] = [];
  for (const book of friendBooks) {
    if (yourShelfBookIds.has(book.bookId) || seen.has(book.bookId)) continue;
    seen.add(book.bookId);
    const matchScore = book.genres.reduce((sum, genre) => sum + (yourGenres.get(genre) ?? 0), 0);
    rows.push({
      bookId: book.bookId,
      title: book.title,
      authors: book.authors,
      coverUrl: book.coverUrl,
      coverImageId: book.coverImageId,
      friendRating: book.rating,
      matchScore,
    });
  }
  return rows
    .sort((a, b) => b.matchScore - a.matchScore || (b.friendRating ?? 0) - (a.friendRating ?? 0))
    .slice(0, MAX_RECOMMENDATIONS);
}

/** Computes the full "you vs friend" comparison: genre/author frequency
 * and overlap, a headline compatibility score, books you've both read
 * (with each side's rating), and reading recommendations pulled from the
 * friend's shelf. Pure — callers are expected to have already filtered
 * yourBooks/friendBooks down to READ books; yourShelfBookIds is your
 * *entire* shelf regardless of status, used only to exclude books you
 * already have from recommendations. */
export function computeCompareStats(
  yourBooks: CompareBookInput[],
  friendBooks: CompareBookInput[],
  yourShelfBookIds: Set<string> = new Set()
): CompareStats {
  const yourGenres = frequency(yourBooks, "genres");
  const friendGenres = frequency(friendBooks, "genres");
  const yourAuthors = frequency(yourBooks, "authors");
  const friendAuthors = frequency(friendBooks, "authors");

  return {
    genres: mergeRows(yourGenres, friendGenres),
    authors: mergeRows(yourAuthors, friendAuthors),
    sharedGenres: [...yourGenres.keys()].filter((name) => friendGenres.has(name)),
    sharedAuthors: [...yourAuthors.keys()].filter((name) => friendAuthors.has(name)),
    yourOnlyGenres: onlyInFirst(yourGenres, friendGenres),
    friendOnlyGenres: onlyInFirst(friendGenres, yourGenres),
    yourOnlyAuthors: onlyInFirst(yourAuthors, friendAuthors),
    friendOnlyAuthors: onlyInFirst(friendAuthors, yourAuthors),
    compatibilityScore: computeCompatibilityScore(yourGenres, friendGenres, yourAuthors, friendAuthors),
    sharedBooks: computeSharedBooks(yourBooks, friendBooks),
    recommendations: computeRecommendations(friendBooks, yourShelfBookIds, yourGenres),
  };
}
