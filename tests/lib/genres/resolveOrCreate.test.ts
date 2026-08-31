import { describe, it, expect } from "vitest";
import { parseFuzzyMatchResponse } from "@/lib/genres/resolveOrCreate";

describe("parseFuzzyMatchResponse", () => {
  it("returns the matched candidate when Claude reports a match", () => {
    expect(parseFuzzyMatchResponse('{"match": "Philosophy"}', ["Philosophy", "Fiction"])).toBe("Philosophy");
  });

  it("returns null when Claude reports no match", () => {
    expect(parseFuzzyMatchResponse('{"match": null}', ["Philosophy", "Fiction"])).toBeNull();
  });

  it("strips a markdown code fence before parsing", () => {
    expect(parseFuzzyMatchResponse('```json\n{"match": "Fiction"}\n```', ["Philosophy", "Fiction"])).toBe("Fiction");
  });

  it("returns null for malformed JSON", () => {
    expect(parseFuzzyMatchResponse("not json", ["Philosophy"])).toBeNull();
  });

  it("returns null when the reported match isn't actually in the candidate list (guards against hallucination)", () => {
    expect(parseFuzzyMatchResponse('{"match": "Made Up Genre"}', ["Philosophy", "Fiction"])).toBeNull();
  });

  it("returns null when match is present but not a string", () => {
    expect(parseFuzzyMatchResponse('{"match": 42}', ["Philosophy"])).toBeNull();
  });
});
