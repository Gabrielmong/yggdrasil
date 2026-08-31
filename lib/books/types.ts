export interface BookData {
  isbn: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  description: string | null;
  genres: string[];
  pageCount: number | null;
  publishedYear: number | null;
  source: "GOOGLE_BOOKS" | "OPEN_LIBRARY" | "HARDCOVER" | "MANUAL";
}
