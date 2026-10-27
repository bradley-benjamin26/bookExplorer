import type { TaggedTerm } from "@book-explorer/shared";
import { describe, expect, it } from "vitest";
import { addTerm, draftChanged, removeTerm, visibleSubjects } from "./termsDraft";

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

  const t = (label: string, lcsh: boolean): TaggedTerm => ({ label, sources: lcsh ? ["lcsh"] : ["openLibrary"] });
  it("puts LCSH subjects first, then fills to five", () => {
    const labels = ["A", "B", "C", "D", "E", "F", "G"];
    expect(visibleSubjects(labels, [t("F", true), t("C", true), t("A", false)])).toEqual(["C", "F", "A", "B", "D"]);
  });
  it("matches LCSH terms by subjectKey", () => {
    expect(visibleSubjects(["x", "y", "z", "w", "v", "Science fiction"], [t("Science Fiction.", true)])[0]).toBe("Science fiction");
  });
  it("returns short lists unchanged", () => {
    expect(visibleSubjects(["b", "a"], [t("a", true)])).toEqual(["a", "b"]);
    expect(visibleSubjects([], [])).toEqual([]);
  });
});
