import { describe, expect, it } from "vitest";
import { addTerm, draftChanged, removeTerm } from "./termsDraft";

describe("termsDraft", () => {
  it("adds a trimmed term once, ignoring near-duplicates", () => {
    expect(addTerm(["Science fiction"], "  science-fiction ")).toEqual(["Science fiction"]);
    expect(addTerm(["Science fiction"], "Space opera")).toEqual(["Science fiction", "Space opera"]);
    expect(addTerm([], "   ")).toEqual([]);
  });
  it("removes a term", () => {
    expect(removeTerm(["a", "b"], "a")).toEqual(["b"]);
  });
  it("draft differs from record", () => {
    expect(draftChanged({ subjects: ["a"], genres: [] }, { subjects: ["a"], genres: [] })).toBe(false);
    expect(draftChanged({ subjects: [], genres: [] }, { subjects: ["a"], genres: [] })).toBe(true);
    expect(draftChanged({ subjects: ["a"], genres: ["b"] }, { subjects: ["a"], genres: ["c"] })).toBe(true);
  });
});
