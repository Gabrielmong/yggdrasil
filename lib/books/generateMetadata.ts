import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

export interface GeneratedMetadata {
  authors?: string[];
  description?: string;
  genres?: string[];
  tags?: string[];
}

/** Parses Claude's generated-metadata response, guarding against malformed
 * JSON or unexpected field shapes. Pure, no I/O. */
export function parseGeneratedMetadata(text: string): GeneratedMetadata {
  const json = text.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== "object") return {};

  const record = parsed as Record<string, unknown>;

  return {
    authors: Array.isArray(record.authors)
      ? record.authors.filter((author): author is string => typeof author === "string").map((author) => author.trim()).filter(Boolean)
      : undefined,
    description: typeof record.description === "string" ? record.description.trim() : undefined,
    genres: Array.isArray(record.genres)
      ? record.genres.filter((genre): genre is string => typeof genre === "string").map((genre) => genre.trim()).filter(Boolean)
      : undefined,
    tags: Array.isArray(record.tags)
      ? record.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean)
      : undefined,
  };
}

async function existingCanonicalNames(limit = 300): Promise<{ genres: string[]; tags: string[] }> {
  const [genres, tags] = await Promise.all([
    prisma.genre.findMany({ select: { name: true }, take: limit, orderBy: { name: "asc" } }),
    prisma.tag.findMany({ select: { name: true }, take: limit, orderBy: { name: "asc" } }),
  ]);
  return { genres: genres.map((g) => g.name), tags: tags.map((t) => t.name) };
}

/** Generates clean, reader-facing genres/tags (and fills a missing
 * description/authors) for a book, using whatever raw provider data is
 * available as a hint rather than as literal output — provider "genres"
 * (especially OpenLibrary's raw bibliographic subject headings) are often
 * far too specific to use directly. Also biases toward reusing an existing
 * canonical Genre/Tag name whenever one reasonably fits, so the taxonomy
 * doesn't keep fragmenting as more books are added. Returns `{}` (no-op)
 * when Claude isn't configured. */
export async function generateMetadata(book: {
  title: string;
  authors: string[];
  description: string | null;
  genres: string[];
}): Promise<GeneratedMetadata> {
  if (!anthropic) return {};

  const { genres: existingGenres, tags: existingTags } = await existingCanonicalNames();

  const response = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: [
          "Create clean reading metadata for this book. Detect the language from the title, author names, and any supplied metadata, then write the description, genres, and tags in that same language.",
          'Return only valid JSON with this shape: {"authors": string[], "description": string, "genres": string[], "tags": string[] }.',
          "Only provide authors when the author is confidently identifiable from the title or supplied metadata. If uncertain, return an empty authors array. Never invent an author.",
          "Write a neutral synopsis without inventing specific details.",
          'Genres must be broad, standard reader-facing categories (like "Fantasy", "Science Fiction", "Philosophy", "Horror") — never bibliographic subject headings, character names, place names, or overly specific classifications. Use 2 to 5 genres.',
          "Tags can be more specific topical keywords than genres, 3 to 6 of them.",
          "Whenever an existing genre or tag listed below is a reasonable fit, reuse it exactly (same spelling/casing) instead of inventing a new, near-duplicate one. Only introduce a new genre or tag when nothing existing fits.",
          `Existing genres: ${existingGenres.join(", ") || "None yet"}`,
          `Existing tags: ${existingTags.join(", ") || "None yet"}`,
          `Title: ${book.title}`,
          `Authors: ${book.authors.join(", ") || "Unknown"}`,
          `Existing description: ${book.description ?? "Missing"}`,
          `Raw provider subject/category data (unreliable, often far too specific — use only as a hint toward the book's real genres, never as literal output): ${book.genres.join(", ") || "None"}`,
        ].join("\n"),
      },
    ],
  });

  const text = response.content.find((block) => block.type === "text");
  return text?.type === "text" ? parseGeneratedMetadata(text.text) : {};
}
