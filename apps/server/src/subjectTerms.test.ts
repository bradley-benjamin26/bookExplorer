import { describe, expect, it } from "vitest";
import { BookSchema, splitSubjectTerms, subjectKey } from "@book-explorer/shared";

describe("subject term cleaning", () => {
  it("drops NYT and other machine tags, keeps real subjects", () => {
    expect(splitSubjectTerms(["Science fiction", "nyt:mass-market-monthly=2021-11-07", "series:Dune", "Science fiction: history"])).toEqual({
      subjects: ["Science fiction", "Science fiction: history"],
      awards: [],
    });
  });
  it("turns award tags into readable awards, deduped", () => {
    expect(splitSubjectTerms(["Award:Hugo_Award=1966", "award:hugo_award=1966", "Award:Nebula_Award=Novel", "award:Locus_Award"]).awards).toEqual([
      "Hugo Award (1966)",
      "Nebula Award (Novel)",
      "Locus Award",
    ]);
  });
  it("keys near-duplicates together", () => {
    expect(subjectKey("Science-Fiction")).toBe(subjectKey("science fiction"));
    expect(subjectKey("Dune (Imaginary place), fiction")).toBe(subjectKey("Dune (Imaginary Place)"));
    expect(subjectKey("Fiction")).not.toBe("");
  });
  it("parses a cached Book that predates awards", () => {
    const bookWithoutAwards = {
      isbn: "1", title: "T", authors: [], subjects: [], genres: [], description: null, descriptionSource: null,
      descriptionSourceUrl: null, coverUrl: null, coverSource: null, openLibraryWorkId: null, openLibraryEditionId: null,
      wikidataId: null, format: null, rating: null, reviews: [],
    };
    expect(BookSchema.parse(bookWithoutAwards).awards).toEqual([]);
  });
});
