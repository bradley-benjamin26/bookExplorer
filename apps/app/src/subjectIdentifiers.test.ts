import { SubjectSchema } from "@book-explorer/shared";
import { describe, expect, it } from "vitest";
import { subjectIdentifiers } from "./subjectIdentifiers";

describe("subjectIdentifiers", () => {
  it("lists Open Library, Library of Congress and Wikidata in order", () => {
    expect(
      subjectIdentifiers({ slug: "fairy_tales", wikidataId: "Q12345", lcshUri: "http://id.loc.gov/authorities/subjects/sh85101653" })
    ).toEqual([
      { source: "Open Library", id: "fairy_tales", url: "https://openlibrary.org/subjects/fairy_tales" },
      { source: "Library of Congress", id: "sh85101653", url: "http://id.loc.gov/authorities/subjects/sh85101653" },
      { source: "Wikidata", id: "Q12345", url: "https://www.wikidata.org/wiki/Q12345" },
    ]);
  });

  it("omits null sources", () => {
    expect(subjectIdentifiers({ slug: "x", wikidataId: null, lcshUri: null }).map((r) => r.source)).toEqual(["Open Library"]);
  });
});

describe("SubjectSchema", () => {
  it("defaults lcshUri to null for old cached subjects", () => {
    const old = { slug: "x", name: "X", workCount: 1, wikidataId: null, description: null, relatedConcepts: [], books: [] };
    expect(SubjectSchema.parse(old).lcshUri).toBeNull();
  });
});
