import { beforeEach, describe, expect, it, vi } from "vitest";
import * as locLinkedData from "../sources/locLinkedData.js";
import * as openLibrary from "../sources/openLibrary.js";
import * as wikidata from "../sources/wikidata.js";
import * as subjectCanon from "./subjectCanon.js";
import { getSubjectBooks, getSubjectDetail } from "./subjectService.js";

vi.mock("../sources/openLibrary.js", () => ({
  getSubject: vi.fn(),
}));
vi.mock("../sources/wikidata.js", () => ({
  searchConceptQid: vi.fn(),
  fetchRelatedConcepts: vi.fn(),
  fetchDescription: vi.fn(),
}));
vi.mock("../sources/locLinkedData.js", () => ({
  findSubjectHeadingUri: vi.fn(),
  fetchBroaderNarrower: vi.fn(),
  EMPTY: { broader: [], narrower: [], wikidataId: null },
}));
vi.mock("./subjectCanon.js", () => ({
  canonicalizeSubjects: vi.fn(async () => new Map()),
}));

function mockOpenLibrarySubject(name: string) {
  vi.mocked(openLibrary.getSubject).mockResolvedValue({
    name,
    workCount: 1,
    works: [],
  });
}

describe("getSubjectDetail", () => {
  beforeEach(() => {
    vi.mocked(openLibrary.getSubject).mockReset();
    vi.mocked(wikidata.searchConceptQid).mockReset();
    vi.mocked(wikidata.fetchRelatedConcepts).mockReset();
    vi.mocked(wikidata.fetchDescription).mockReset().mockResolvedValue(null);
    vi.mocked(locLinkedData.findSubjectHeadingUri).mockReset();
    vi.mocked(locLinkedData.fetchBroaderNarrower).mockReset();
    vi.mocked(subjectCanon.canonicalizeSubjects).mockReset().mockResolvedValue(new Map());
  });

  it("merges a broader term present in both Wikidata and LCSH into one tagged concept", async () => {
    mockOpenLibrarySubject("Fairy tales");
    vi.mocked(wikidata.searchConceptQid).mockResolvedValue("Q123");
    vi.mocked(wikidata.fetchRelatedConcepts).mockResolvedValue([
      { relation: "broader", label: "Tales", sources: ["wikidata"], wikidataId: "Q999" },
    ]);
    vi.mocked(locLinkedData.findSubjectHeadingUri).mockResolvedValue("https://id.loc.gov/authorities/subjects/sh123");
    vi.mocked(locLinkedData.fetchBroaderNarrower).mockResolvedValue({ broader: ["Tales"], narrower: [], wikidataId: null });

    const subject = await getSubjectDetail("fairy_tales");
    expect(subject?.relatedConcepts).toEqual([
      { relation: "broader", label: "Tales", sources: ["wikidata", "lcsh"], wikidataId: "Q999" },
    ]);
  });

  it("returns the LCSH heading uri, or null when there is none", async () => {
    mockOpenLibrarySubject("Fairy tales (uri)");
    vi.mocked(wikidata.searchConceptQid).mockResolvedValue(null);
    vi.mocked(wikidata.fetchRelatedConcepts).mockResolvedValue([]);
    vi.mocked(locLinkedData.findSubjectHeadingUri).mockResolvedValue("http://id.loc.gov/authorities/subjects/sh85101653");
    vi.mocked(locLinkedData.fetchBroaderNarrower).mockResolvedValue({ broader: [], narrower: [], wikidataId: null });
    expect((await getSubjectDetail("fairy_tales_uri"))?.lcshUri).toBe("http://id.loc.gov/authorities/subjects/sh85101653");

    mockOpenLibrarySubject("Fairy tales (no uri)");
    vi.mocked(locLinkedData.findSubjectHeadingUri).mockResolvedValue(null);
    expect((await getSubjectDetail("fairy_tales_no_uri"))?.lcshUri).toBeNull();
  });

  it("includes the Wikidata English description when available", async () => {
    mockOpenLibrarySubject("Fairy tales (described)");
    vi.mocked(wikidata.searchConceptQid).mockResolvedValue("Q123");
    vi.mocked(wikidata.fetchRelatedConcepts).mockResolvedValue([]);
    vi.mocked(wikidata.fetchDescription).mockResolvedValue("genre of folklore");
    vi.mocked(locLinkedData.findSubjectHeadingUri).mockResolvedValue(null);

    const subject = await getSubjectDetail("fairy_tales_described");
    expect(subject?.description).toBe("genre of folklore");
  });

  it("includes an LCSH-only concept with a null wikidataId", async () => {
    mockOpenLibrarySubject("Fairy tales (LCSH only)");
    vi.mocked(wikidata.searchConceptQid).mockResolvedValue(null);
    vi.mocked(wikidata.fetchRelatedConcepts).mockResolvedValue([]);
    vi.mocked(locLinkedData.findSubjectHeadingUri).mockResolvedValue("https://id.loc.gov/authorities/subjects/sh456");
    vi.mocked(locLinkedData.fetchBroaderNarrower).mockResolvedValue({ broader: ["Folklore"], narrower: [], wikidataId: null });

    const subject = await getSubjectDetail("fairy_tales_lcsh_only");
    expect(subject?.relatedConcepts).toEqual([{ relation: "broader", label: "Folklore", sources: ["lcsh"], wikidataId: null }]);
  });

  it("falls back to Wikidata-only concepts when the LCSH lookup finds no heading", async () => {
    mockOpenLibrarySubject("Fairy tales (no LCSH)");
    vi.mocked(wikidata.searchConceptQid).mockResolvedValue("Q123");
    vi.mocked(wikidata.fetchRelatedConcepts).mockResolvedValue([
      { relation: "broader", label: "Tales", sources: ["wikidata"], wikidataId: "Q999" },
    ]);
    vi.mocked(locLinkedData.findSubjectHeadingUri).mockResolvedValue(null);
    vi.mocked(locLinkedData.fetchBroaderNarrower).mockResolvedValue({ broader: [], narrower: [], wikidataId: null });

    const subject = await getSubjectDetail("fairy_tales_no_lcsh");
    expect(subject?.relatedConcepts).toEqual([
      { relation: "broader", label: "Tales", sources: ["wikidata"], wikidataId: "Q999" },
    ]);
  });
  it("trusts the Wikidata id LCSH links to over a name search", async () => {
    mockOpenLibrarySubject("Ghosts");
    vi.mocked(wikidata.searchConceptQid).mockResolvedValue("Q107122133");
    vi.mocked(wikidata.fetchRelatedConcepts).mockResolvedValue([]);
    vi.mocked(locLinkedData.findSubjectHeadingUri).mockResolvedValue("https://id.loc.gov/authorities/subjects/sh85054821");
    vi.mocked(locLinkedData.fetchBroaderNarrower).mockResolvedValue({ broader: [], narrower: [], wikidataId: "Q45529" });

    const subject = await getSubjectDetail("ghosts_lcsh_link");
    expect(subject?.wikidataId).toBe("Q45529");
    expect(wikidata.searchConceptQid).not.toHaveBeenCalled();
    expect(wikidata.fetchRelatedConcepts).toHaveBeenCalledWith("Q45529");
  });

  it("falls back to the name search when the LCSH record has no Wikidata link", async () => {
    mockOpenLibrarySubject("Ghosts (no link)");
    vi.mocked(wikidata.searchConceptQid).mockResolvedValue("Q777");
    vi.mocked(wikidata.fetchRelatedConcepts).mockResolvedValue([]);
    vi.mocked(locLinkedData.findSubjectHeadingUri).mockResolvedValue("https://id.loc.gov/authorities/subjects/sh1");
    vi.mocked(locLinkedData.fetchBroaderNarrower).mockResolvedValue({ broader: [], narrower: [], wikidataId: null });

    const subject = await getSubjectDetail("ghosts_no_link");
    expect(subject?.wikidataId).toBe("Q777");
  });

  it("serves the page when LOC and Wikidata fail, and caches that only briefly", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      mockOpenLibrarySubject("Outage");
      vi.mocked(locLinkedData.findSubjectHeadingUri).mockRejectedValue(new Error("LOC timed out"));
      vi.mocked(wikidata.searchConceptQid).mockRejectedValue(new Error("Wikidata timed out"));

      const degraded = await getSubjectDetail("outage");
      expect(degraded).toMatchObject({ name: "Outage", wikidataId: null, relatedConcepts: [] });

      vi.mocked(locLinkedData.findSubjectHeadingUri).mockResolvedValue("https://id.loc.gov/authorities/subjects/sh9");
      vi.mocked(locLinkedData.fetchBroaderNarrower).mockResolvedValue({ broader: ["Folklore"], narrower: [], wikidataId: null });
      vi.mocked(wikidata.searchConceptQid).mockResolvedValue(null);
      vi.advanceTimersByTime(6 * 60 * 1000);

      const recovered = await getSubjectDetail("outage");
      expect(recovered?.relatedConcepts).toEqual([{ relation: "broader", label: "Folklore", sources: ["lcsh"], wikidataId: null }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the canonical slug and unions variant books with the primary list first", async () => {
    const canonical = {
      uri: "http://id.loc.gov/authorities/subjects/sh85062085",
      heading: "Horror tales, American",
      display: "American horror tales",
      slug: "horror_tales_american",
      variants: ["American horror tales"],
    };
    vi.mocked(subjectCanon.canonicalizeSubjects).mockImplementation(async (labels) =>
      new Map(labels.map((label) => [label, canonical]))
    );
    vi.mocked(wikidata.fetchRelatedConcepts).mockResolvedValue([]);
    vi.mocked(wikidata.fetchDescription).mockResolvedValue(null);
    vi.mocked(wikidata.searchConceptQid).mockResolvedValue(null);
    vi.mocked(locLinkedData.fetchBroaderNarrower).mockResolvedValue({ broader: [], narrower: [], wikidataId: null });
    const bySlug = {
      horror_tales_american: {
        name: "Horror tales, American", workCount: 9,
        works: [
          { workId: "OL1W", title: "Primary first", authors: [], coverUrl: null },
          { workId: "OL2W", title: "Shared primary", authors: [], coverUrl: null },
        ],
      },
      american_horror_tales: {
        name: "American horror tales", workCount: 12,
        works: [
          { workId: "OL2W", title: "Shared variant", authors: [], coverUrl: null },
          { workId: "OL3W", title: "Variant second", authors: [], coverUrl: null },
        ],
      },
    };
    vi.mocked(openLibrary.getSubject).mockImplementation(async (slug) => bySlug[slug as keyof typeof bySlug] ?? null);

    const canonicalRequest = await getSubjectDetail("horror_tales_american");
    const variantRequest = await getSubjectDetail("american_horror_tales");

    expect(canonicalRequest).toMatchObject({
      slug: "horror_tales_american",
      name: "American horror tales",
      workCount: 12,
      books: [
        { openLibraryWorkId: "OL1W" },
        { openLibraryWorkId: "OL2W", title: "Shared primary" },
        { openLibraryWorkId: "OL3W" },
      ],
    });
    expect(variantRequest).toMatchObject({
      slug: "horror_tales_american",
      name: "American horror tales",
      workCount: 12,
      books: [
        { openLibraryWorkId: "OL2W", title: "Shared variant" },
        { openLibraryWorkId: "OL3W" },
        { openLibraryWorkId: "OL1W" },
      ],
    });
  });

  it("returns the primary books when a variant subject fetch fails", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const canonical = {
        uri: "http://id.loc.gov/authorities/subjects/sh123",
        heading: "Variant outage",
        display: "Variant outage",
        slug: "variant_outage",
        variants: ["Other spelling"],
      };
      vi.mocked(subjectCanon.canonicalizeSubjects).mockImplementation(async (labels) =>
        new Map(labels.map((label) => [label, canonical]))
      );
      let variantAttempts = 0;
      vi.mocked(openLibrary.getSubject).mockImplementation(async (slug) => {
        if (slug === "other_spelling") {
          variantAttempts += 1;
          if (variantAttempts === 1) throw new Error("Open Library unavailable");
          return { name: "Other spelling", workCount: 2, works: [{ workId: "OL6W", title: "Recovered", authors: [], coverUrl: null }] };
        }
        return { name: "Variant outage", workCount: 1, works: [{ workId: "OL4W", title: "Primary", authors: [], coverUrl: null }] };
      });
      vi.mocked(locLinkedData.fetchBroaderNarrower).mockResolvedValue({ broader: [], narrower: [], wikidataId: null });
      vi.mocked(wikidata.fetchRelatedConcepts).mockResolvedValue([]);
      vi.mocked(wikidata.fetchDescription).mockResolvedValue(null);
      vi.mocked(wikidata.searchConceptQid).mockResolvedValue(null);

      await expect(getSubjectDetail("variant_outage")).resolves.toMatchObject({
        slug: "variant_outage",
        books: [{ openLibraryWorkId: "OL4W" }],
      });
      vi.advanceTimersByTime(6 * 60 * 1000);
      await expect(getSubjectDetail("variant_outage")).resolves.toMatchObject({
        books: [{ openLibraryWorkId: "OL4W" }, { openLibraryWorkId: "OL6W" }],
        workCount: 2,
      });
      expect(variantAttempts).toBe(2);
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });

  it("leaves an unresolved subject unchanged", async () => {
    vi.mocked(openLibrary.getSubject).mockResolvedValue({
      name: "Zombies", workCount: 1, works: [{ workId: "OL5W", title: "Z", authors: [], coverUrl: null }],
    });
    vi.mocked(subjectCanon.canonicalizeSubjects).mockResolvedValue(new Map([["Zombies", null]]));
    vi.mocked(locLinkedData.findSubjectHeadingUri).mockResolvedValue(null);
    vi.mocked(wikidata.searchConceptQid).mockResolvedValue(null);

    await expect(getSubjectDetail("zombies")).resolves.toEqual({
      slug: "zombies",
      name: "Zombies",
      workCount: 1,
      wikidataId: null,
      lcshUri: null,
      description: null,
      relatedConcepts: [],
      books: [{ openLibraryWorkId: "OL5W", title: "Z", authors: [], coverUrl: null }],
    });
  });
});

describe("getSubjectBooks", () => {
  it("returns Open Library's books and work count without the LCSH or Wikidata concept lookups", async () => {
    vi.mocked(wikidata.searchConceptQid).mockReset();
    vi.mocked(wikidata.fetchRelatedConcepts).mockReset();
    vi.mocked(locLinkedData.findSubjectHeadingUri).mockReset();
    vi.mocked(openLibrary.getSubject).mockResolvedValue({
      name: "Tudor England",
      workCount: 321,
      works: [{ workId: "OL1W", title: "Wolf Hall", authors: [], coverUrl: null }],
    });

    const subject = await getSubjectBooks("tudor_england");
    expect(subject).toMatchObject({ workCount: 321, relatedConcepts: [], books: [{ openLibraryWorkId: "OL1W" }] });
    expect(locLinkedData.findSubjectHeadingUri).not.toHaveBeenCalled();
    expect(wikidata.searchConceptQid).not.toHaveBeenCalled();
    expect(wikidata.fetchRelatedConcepts).not.toHaveBeenCalled();
  });
});

describe("legacy '--' slugs", () => {
  beforeEach(() => {
    vi.mocked(openLibrary.getSubject).mockReset();
  });

  it("asks Open Library for the canonical slug first", async () => {
    vi.mocked(openLibrary.getSubject).mockResolvedValue({ name: "Science fiction authorship", workCount: 141, works: [] });

    const subject = await getSubjectBooks("science_fiction_--_authorship");
    expect(openLibrary.getSubject).toHaveBeenCalledTimes(1);
    expect(openLibrary.getSubject).toHaveBeenCalledWith("science_fiction_authorship");
    expect(subject).toMatchObject({ slug: "science_fiction_authorship", workCount: 141 });
  });

  it("falls back to the raw slug when the canonical one has no works, still answering with the canonical slug", async () => {
    vi.mocked(openLibrary.getSubject).mockImplementation(async (slug) =>
      slug === "authors_american_20th_century_interviews"
        ? { name: "Authors, American 20th century interviews", workCount: 0, works: [] }
        : { name: "Authors, American -- 20th century -- Interviews", workCount: 4, works: [] }
    );

    const subject = await getSubjectBooks("authors,_american_--_20th_century_--_interviews");
    expect(openLibrary.getSubject).toHaveBeenNthCalledWith(1, "authors_american_20th_century_interviews");
    expect(openLibrary.getSubject).toHaveBeenNthCalledWith(2, "authors,_american_--_20th_century_--_interviews");
    expect(subject).toMatchObject({ slug: "authors_american_20th_century_interviews", workCount: 4 });
  });
});
