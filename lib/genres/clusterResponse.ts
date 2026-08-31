export interface Cluster {
  canonical: string;
  raw: string[];
}

/** Parses Claude's clustering response into a validated cluster list.
 * Falls back to one cluster per raw value (safe default — never drops a
 * label) on malformed JSON, a missing/invalid `clusters` field, or a
 * raw value the response never covered. Ignores any reported raw value
 * that wasn't actually in the input list (guards against hallucination),
 * and ignores a raw value in any cluster after the first one that claims
 * it — the same input can only ever belong to one output cluster, even if
 * Claude's response mistakenly lists it under two. Pure, no I/O. Shared by
 * scripts/backfill-genres-tags.ts (raw book strings -> entities) and
 * scripts/consolidate-genres-tags.ts (existing entities -> fewer, broader
 * entities). */
export function parseClusterResponse(text: string, rawValues: string[]): Cluster[] {
  const cleaned = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return rawValues.map((raw) => ({ canonical: raw, raw: [raw] }));
  }

  const clustersField = (parsed as { clusters?: unknown } | null)?.clusters;
  if (!Array.isArray(clustersField)) {
    return rawValues.map((raw) => ({ canonical: raw, raw: [raw] }));
  }

  const valid: Cluster[] = [];
  const covered = new Set<string>();
  for (const entry of clustersField) {
    if (!entry || typeof entry !== "object") continue;
    const canonical = (entry as Record<string, unknown>).canonical;
    const raw = (entry as Record<string, unknown>).raw;
    if (typeof canonical !== "string" || !Array.isArray(raw)) continue;

    const rawStrings = raw.filter(
      (r): r is string => typeof r === "string" && rawValues.includes(r) && !covered.has(r)
    );
    if (rawStrings.length === 0) continue;

    valid.push({ canonical: canonical.trim(), raw: rawStrings });
    rawStrings.forEach((r) => covered.add(r));
  }

  for (const raw of rawValues) {
    if (!covered.has(raw)) valid.push({ canonical: raw, raw: [raw] });
  }
  return valid;
}
