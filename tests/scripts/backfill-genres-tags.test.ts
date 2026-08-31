import { describe, it, expect } from "vitest";
import { parseClusterResponse } from "../../scripts/backfill-genres-tags";

describe("parseClusterResponse", () => {
  it("returns the parsed clusters when every raw value is covered", () => {
    const result = parseClusterResponse(
      '{"clusters": [{"canonical": "Philosophy", "raw": ["Filosofia", "Philosophy"]}, {"canonical": "Fiction", "raw": ["Fiction"]}]}',
      ["Filosofia", "Philosophy", "Fiction"]
    );
    expect(result).toEqual([
      { canonical: "Philosophy", raw: ["Filosofia", "Philosophy"] },
      { canonical: "Fiction", raw: ["Fiction"] },
    ]);
  });

  it("gives an uncovered raw value its own canonical entry", () => {
    const result = parseClusterResponse(
      '{"clusters": [{"canonical": "Fiction", "raw": ["Fiction"]}]}',
      ["Fiction", "Orphaned Genre"]
    );
    expect(result).toEqual([
      { canonical: "Fiction", raw: ["Fiction"] },
      { canonical: "Orphaned Genre", raw: ["Orphaned Genre"] },
    ]);
  });

  it("falls back to one cluster per raw value on malformed JSON", () => {
    const result = parseClusterResponse("not json", ["Fiction", "Philosophy"]);
    expect(result).toEqual([
      { canonical: "Fiction", raw: ["Fiction"] },
      { canonical: "Philosophy", raw: ["Philosophy"] },
    ]);
  });

  it("falls back to one cluster per raw value when the clusters field is missing", () => {
    const result = parseClusterResponse('{"oops": true}', ["Fiction"]);
    expect(result).toEqual([{ canonical: "Fiction", raw: ["Fiction"] }]);
  });

  it("ignores a raw entry in the response that was never in the input list (guards against hallucination)", () => {
    const result = parseClusterResponse(
      '{"clusters": [{"canonical": "Fiction", "raw": ["Fiction", "Made Up Value"]}]}',
      ["Fiction"]
    );
    expect(result).toEqual([{ canonical: "Fiction", raw: ["Fiction"] }]);
  });

  it("strips a markdown code fence before parsing", () => {
    const result = parseClusterResponse('```json\n{"clusters": [{"canonical": "Fiction", "raw": ["Fiction"]}]}\n```', ["Fiction"]);
    expect(result).toEqual([{ canonical: "Fiction", raw: ["Fiction"] }]);
  });
});
