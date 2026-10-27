import { describe, expect, it } from "vitest";
import { BookSchema, slugifySubject, splitSubjectTerms, subjectKey } from "@book-explorer/shared";
import { isSubjectSlug } from "./validation.js";

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

describe("slugifySubject", () => {
  const cases: [string, string][] = [
    ["Science fiction -- Authorship", "science_fiction_authorship"],
    ["science_fiction_--_authorship", "science_fiction_authorship"],
    ["Science fiction--Authorship", "science_fiction_authorship"],
    ["United States -- History -- Civil War, 1861-1865", "united_states_history_civil_war_1861-1865"],
    ["Dune (Imaginary place)", "dune_(imaginary_place)"],
    ["African-Americans", "african-americans"],
    ["Children's stories", "children's_stories"],
  ];
  it.each(cases)("slugs %j as %j, idempotently", (name, slug) => {
    expect(slugifySubject(name)).toBe(slug);
    expect(slugifySubject(slugifySubject(name))).toBe(slugifySubject(name));
  });
  it("treats only the canonical form as a subject slug", () => {
    expect(isSubjectSlug("science_fiction_authorship")).toBe(true);
    expect(isSubjectSlug("science_fiction_--_authorship")).toBe(false);
  });
});
