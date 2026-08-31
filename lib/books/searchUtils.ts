export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesSearchQuery(query: string, result: { title: string; authors: string[] }): boolean {
  const tokens = query.split(" ").filter(Boolean);

  if (tokens.length === 0) return true;

  const haystacks = [result.title, ...result.authors].map((value) => {
    const normalized = normalizeSearchText(value);
    const words = normalized.split(" ").filter(Boolean);
    const expanded = new Set<string>(words);

    for (let i = 0; i < words.length - 1; i++) {
      if (words[i].length === 1 && words[i + 1].length === 1) {
        expanded.add(`${words[i]}${words[i + 1]}`);
      }
    }

    return [...expanded];
  });

  return tokens.every((token) =>
    haystacks.some((terms) => terms.some((term) => term.includes(token)))
  );
}

export function scoreSearchResult(query: string, result: { title: string; authors: string[] }): number {
  const normalizedQuery = normalizeSearchText(query);
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  const haystacks = [normalizeSearchText(result.title), ...result.authors.map((author) => normalizeSearchText(author))];

  let score = 0;
  for (const token of tokens) {
    for (const haystack of haystacks) {
      if (haystack === token) score += 10;
      else if (haystack.startsWith(token)) score += 6;
      else if (haystack.includes(token)) score += 3;
    }
  }

  const title = normalizeSearchText(result.title);
  if (title === normalizedQuery) score += 20;
  else if (title.startsWith(normalizedQuery)) score += 10;

  return score;
}
