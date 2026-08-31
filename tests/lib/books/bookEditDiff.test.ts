import { describe, it, expect } from "vitest";
import { computeBookEditDiff, computeRevertDiff } from "@/lib/books/bookEditDiff";

const CURRENT = {
  title: "Old Title",
  authors: ["Old Author"],
  description: "Old description",
  genres: ["classic"],
  tags: ["classic"],
  coverUrl: "http://example.com/old.jpg",
  coverImageId: null,
};

describe("computeBookEditDiff", () => {
  it("returns a diff containing only the fields that changed", () => {
    const diff = computeBookEditDiff(CURRENT, { description: "New description" });

    expect(diff).toEqual({
      previousValues: { description: "Old description" },
      newValues: { description: "New description" },
    });
  });

  it("detects a changed tags array", () => {
    const diff = computeBookEditDiff(CURRENT, { tags: ["classic", "gothic"] });

    expect(diff).toEqual({
      previousValues: { tags: ["classic"] },
      newValues: { tags: ["classic", "gothic"] },
    });
  });

  it("handles multiple changed fields in one patch", () => {
    const diff = computeBookEditDiff(CURRENT, {
      description: "New description",
      coverUrl: null,
    });

    expect(diff).toEqual({
      previousValues: { description: "Old description", coverUrl: "http://example.com/old.jpg" },
      newValues: { description: "New description", coverUrl: null },
    });
  });

  it("returns null when the patch doesn't actually change anything", () => {
    const diff = computeBookEditDiff(CURRENT, {
      description: "Old description",
      tags: ["classic"],
    });

    expect(diff).toBeNull();
  });

  it("ignores fields not present in the patch", () => {
    const diff = computeBookEditDiff(CURRENT, { description: "New description" });

    expect(diff!.previousValues.tags).toBeUndefined();
    expect(diff!.newValues.coverUrl).toBeUndefined();
  });
});

describe("computeRevertDiff", () => {
  it("restores a single field, recording the current (bad) value as previousValues", () => {
    const diff = computeRevertDiff(
      {
        title: "Old Title",
        authors: ["Old Author"],
        description: "Vandalized description",
        genres: ["Old Genre"],
        tags: ["classic"],
        coverUrl: "http://example.com/old.jpg",
        coverImageId: null,
      },
      { description: "Old description" } // the target edit's own previousValues
    );

    expect(diff).toEqual({
      previousValues: { description: "Vandalized description" },
      newValues: { description: "Old description" },
    });
  });

  it("restores multiple fields from a multi-field edit", () => {
    const diff = computeRevertDiff(
      { title: "Old Title", authors: ["Old Author"], description: "Bad", genres: ["Old Genre"], tags: ["spam"], coverUrl: null, coverImageId: null },
      { description: "Good", tags: ["classic"] }
    );

    expect(diff).toEqual({
      previousValues: { description: "Bad", tags: ["spam"] },
      newValues: { description: "Good", tags: ["classic"] },
    });
  });

  it("returns null when the edit to revert touched no fields", () => {
    const diff = computeRevertDiff(
      { title: "Old Title", authors: ["Old Author"], description: "Bad", genres: ["Old Genre"], tags: ["spam"], coverUrl: null, coverImageId: null },
      {}
    );

    expect(diff).toBeNull();
  });

  it("returns null when the value to restore already matches the book's current value", () => {
    const diff = computeRevertDiff(
      {
        title: "Old Title",
        authors: ["Old Author"],
        description: "Old description",
        genres: ["Old Genre"],
        tags: ["classic"],
        coverUrl: "http://example.com/old.jpg",
        coverImageId: null,
      },
      { description: "Old description" }
    );

    expect(diff).toBeNull();
  });

  it("skips already-equal fields but keeps genuine changes in a mixed revert", () => {
    const diff = computeRevertDiff(
      {
        title: "Old Title",
        authors: ["Old Author"],
        description: "Old description",
        genres: ["Old Genre"],
        tags: ["spam"],
        coverUrl: "http://example.com/old.jpg",
        coverImageId: null,
      },
      { description: "Old description", tags: ["classic"] }
    );

    expect(diff).toEqual({
      previousValues: { tags: ["spam"] },
      newValues: { tags: ["classic"] },
    });
  });
});
