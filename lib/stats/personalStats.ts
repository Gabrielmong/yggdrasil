export interface StatsBook {
  genres: string[];
  authors: string[];
  rating: number | null;
  pageCount: number | null;
  finishedAt: string | null;
  /** When this book was added to the shelf — used as a fallback bucketing
   * date for "books read over time" when finishedAt was never set (e.g.
   * books marked Read before this field started being auto-filled). Not as
   * accurate as a real finishedAt for a book that sat as "Want to Read" for
   * a while first, but better than omitting older books from the chart
   * entirely. */
  createdAt: string;
  /** Callers now pass every one of the user's shelf books, not just READ
   * ones, so shelf-wide totals (below) can be computed alongside the
   * READ-only breakdowns. Everything keyed off "read" behavior still
   * filters to status === "READ" internally. */
  status: "WANT_TO_READ" | "READING" | "READ";
}

// These four row shapes carry a string index signature purely so they can
// be passed as-is to ChartSection's BarChart `dataset` prop (MUI x-charts'
// DatasetElementType requires one) — same precedent as CompareRow in the
// friend-comparison feature. It doesn't affect equality checks in tests.

export interface FrequencyRow {
  name: string;
  count: number;
  [key: string]: string | number;
}

export interface RatingByGenreRow {
  name: string;
  avgRating: number;
  count: number;
  [key: string]: string | number;
}

export interface MonthlyCount {
  month: string; // "YYYY-MM"
  count: number;
  [key: string]: string | number;
}

export interface RatingBucket {
  rating: number; // 1-5
  count: number;
  [key: string]: string | number;
}

export interface PersonalStats {
  totalBooksRead: number;
  totalPagesRead: number;
  genreFrequency: FrequencyRow[];
  authorFrequency: FrequencyRow[];
  booksOverTime: MonthlyCount[];
  avgRatingByGenre: RatingByGenreRow[];
  ratingDistribution: RatingBucket[];
  /** Every book on the shelf regardless of status (Want to Read + Reading
   * + Read) — distinct from totalBooksRead, which counts READ only. */
  totalBooksOnShelf: number;
  /** Number of distinct authors/genres across READ books — same source
   * data as authorFrequency/genreFrequency, just their length, surfaced
   * directly since a simple counter chip is a more natural way to show
   * this than a length. */
  distinctAuthorCount: number;
  distinctGenreCount: number;
  /** Mean rating across READ books that have one; null when none are rated. */
  averageRating: number | null;
}

function frequency(books: StatsBook[], field: "genres" | "authors"): FrequencyRow[] {
  const counts = new Map<string, number>();
  for (const book of books) {
    for (const value of book[field]) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

function computeBooksOverTime(books: StatsBook[]): MonthlyCount[] {
  const counts = new Map<string, number>();
  for (const book of books) {
    // Fall back to createdAt (when it was added to the shelf) for books
    // marked Read before finishedAt was auto-filled — approximate, but
    // keeps them from vanishing off this chart entirely.
    const date = book.finishedAt ?? book.createdAt;
    const month = date.slice(0, 7); // "YYYY-MM-DD..." -> "YYYY-MM"
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return [...counts.entries()].map(([month, count]) => ({ month, count })).sort((a, b) => a.month.localeCompare(b.month));
}

function computeAvgRatingByGenre(books: StatsBook[]): RatingByGenreRow[] {
  const totals = new Map<string, { sum: number; count: number }>();
  for (const book of books) {
    if (book.rating == null) continue;
    for (const genre of book.genres) {
      const entry = totals.get(genre) ?? { sum: 0, count: 0 };
      entry.sum += book.rating;
      entry.count += 1;
      totals.set(genre, entry);
    }
  }
  return [...totals.entries()]
    .map(([name, { sum, count }]) => ({ name, avgRating: Math.round((sum / count) * 10) / 10, count }))
    .sort((a, b) => b.count - a.count);
}

function computeRatingDistribution(books: StatsBook[]): RatingBucket[] {
  const counts = new Map<number, number>([1, 2, 3, 4, 5].map((r) => [r, 0]));
  for (const book of books) {
    if (book.rating == null) continue;
    counts.set(book.rating, (counts.get(book.rating) ?? 0) + 1);
  }
  return [...counts.entries()].map(([rating, count]) => ({ rating, count })).sort((a, b) => a.rating - b.rating);
}

function computeAverageRating(books: StatsBook[]): number | null {
  const rated = books.filter((b) => b.rating != null);
  if (rated.length === 0) return null;
  const sum = rated.reduce((total, b) => total + (b.rating ?? 0), 0);
  return Math.round((sum / rated.length) * 10) / 10;
}

/** Computes personal reading stats from every book on a user's shelf —
 * genre/author frequency, books finished per month, average rating by
 * genre, and rating distribution are all computed from the READ subset;
 * totalBooksOnShelf counts every status. Pure. Each frequency list is
 * returned sorted descending by count (or ascending for time/rating
 * buckets, where order has its own meaning) — callers cap to a display
 * limit if needed. */
export function computePersonalStats(books: StatsBook[]): PersonalStats {
  const readBooks = books.filter((b) => b.status === "READ");
  const genreFrequency = frequency(readBooks, "genres");
  const authorFrequency = frequency(readBooks, "authors");

  return {
    totalBooksRead: readBooks.length,
    totalPagesRead: readBooks.reduce((sum, book) => sum + (book.pageCount ?? 0), 0),
    genreFrequency,
    authorFrequency,
    booksOverTime: computeBooksOverTime(readBooks),
    avgRatingByGenre: computeAvgRatingByGenre(readBooks),
    ratingDistribution: computeRatingDistribution(readBooks),
    totalBooksOnShelf: books.length,
    distinctAuthorCount: authorFrequency.length,
    distinctGenreCount: genreFrequency.length,
    averageRating: computeAverageRating(readBooks),
  };
}
