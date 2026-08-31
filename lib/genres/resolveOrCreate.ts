import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

/** Parses Claude's fuzzy-match response for one raw genre/tag name against
 * a list of existing canonical names. Returns the matched candidate name
 * — validated against the actual candidate list, guarding against a
 * hallucinated name — or null if Claude reported no match, the response
 * was malformed, or the reported match wasn't an actual candidate. Pure,
 * no I/O. */
export function parseFuzzyMatchResponse(text: string, candidateNames: string[]): string | null {
  const cleaned = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const match = (parsed as { match?: unknown }).match;
  if (typeof match !== "string") return null;
  return candidateNames.includes(match) ? match : null;
}

async function fuzzyMatch(rawName: string, candidateNames: string[]): Promise<string | null> {
  if (!anthropic || candidateNames.length === 0) return null;
  try {
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: [
            "Does this new label mean the same thing as one of these existing canonical labels (accounting for translations, synonyms, and near-duplicates)?",
            `New label: ${rawName}`,
            `Existing labels: ${candidateNames.join(", ")}`,
            'Return only valid JSON: {"match": string | null} — the exact existing label it matches, or null if it is genuinely a new, distinct concept.',
          ].join("\n"),
        },
      ],
    });
    const text = response.content.find((block) => block.type === "text");
    return text?.type === "text" ? parseFuzzyMatchResponse(text.text, candidateNames) : null;
  } catch {
    return null;
  }
}

/** Resolves a raw genre/tag string to a canonical Genre/Tag row: exact
 * (case-insensitive) match first; on a miss, an LLM fuzzy-match against
 * the existing canonical names; on no match (or no LLM configured),
 * creates a new row verbatim from the trimmed input. Handles the
 * create-race case (two callers resolving the same brand-new name at
 * once) by re-fetching on a unique-constraint failure. */
export async function resolveOrCreateGenre(rawName: string): Promise<{ id: string; name: string }> {
  const trimmed = rawName.trim();

  const existing = await prisma.genre.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" } } });
  if (existing) return existing;

  const candidates = await prisma.genre.findMany({ select: { id: true, name: true }, take: 500 });
  const matchedName = await fuzzyMatch(trimmed, candidates.map((c) => c.name));
  if (matchedName) {
    const matched = candidates.find((c) => c.name === matchedName);
    if (matched) return matched;
  }

  try {
    return await prisma.genre.create({ data: { name: trimmed } });
  } catch {
    const created = await prisma.genre.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" } } });
    if (created) return created;
    throw new Error(`Failed to resolve or create genre: ${rawName}`);
  }
}

/** Same as resolveOrCreateGenre, for Tag. */
export async function resolveOrCreateTag(rawName: string): Promise<{ id: string; name: string }> {
  const trimmed = rawName.trim();

  const existing = await prisma.tag.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" } } });
  if (existing) return existing;

  const candidates = await prisma.tag.findMany({ select: { id: true, name: true }, take: 500 });
  const matchedName = await fuzzyMatch(trimmed, candidates.map((c) => c.name));
  if (matchedName) {
    const matched = candidates.find((c) => c.name === matchedName);
    if (matched) return matched;
  }

  try {
    return await prisma.tag.create({ data: { name: trimmed } });
  } catch {
    const created = await prisma.tag.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" } } });
    if (created) return created;
    throw new Error(`Failed to resolve or create tag: ${rawName}`);
  }
}
