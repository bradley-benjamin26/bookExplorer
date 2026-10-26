import { describe, expect, it } from "vitest";
import { SUBJECT_SORTS, DEFAULT_SUBJECT_SORT, subjectSortParams } from "./subjectSort";

describe("subjectSort", () => {
  it("labels", () => {
    expect(SUBJECT_SORTS.map((s) => s.label)).toEqual(["Most read", "Top rated", "Newest", "Classic"]);
    expect(DEFAULT_SUBJECT_SORT).toBe("readinglog");
  });
  it("maps to search params", () => {
    expect(subjectSortParams("Science Fiction", "rating")).toEqual({ subject: "Science Fiction", sort: "rating" });
  });
  it("classic uses the subject's own listing", () => {
    expect(subjectSortParams("Science Fiction", "classic")).toBeNull();
  });
});
