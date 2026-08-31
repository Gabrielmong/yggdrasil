export interface ComparableBook {
  genres: string[];
  authors: string[];
}

export interface CompareRow {
  name: string;
  you: number;
  friend: number;
}

export interface CompareStats {
  genres: CompareRow[];
  authors: CompareRow[];
  sharedGenres: string[];
  sharedAuthors: string[];
}

function frequency(books: ComparableBook[], field: "genres" | "authors"): Map<string, number> {
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

/** Computes genre/author frequency for two users' books, plus which
 * genres/authors they share. Pure — callers are expected to have already
 * filtered each side down to READ books. */
export function computeCompareStats(yourBooks: ComparableBook[], friendBooks: ComparableBook[]): CompareStats {
  const yourGenres = frequency(yourBooks, "genres");
  const friendGenres = frequency(friendBooks, "genres");
  const yourAuthors = frequency(yourBooks, "authors");
  const friendAuthors = frequency(friendBooks, "authors");

  return {
    genres: mergeRows(yourGenres, friendGenres),
    authors: mergeRows(yourAuthors, friendAuthors),
    sharedGenres: [...yourGenres.keys()].filter((name) => friendGenres.has(name)),
    sharedAuthors: [...yourAuthors.keys()].filter((name) => friendAuthors.has(name)),
  };
}
