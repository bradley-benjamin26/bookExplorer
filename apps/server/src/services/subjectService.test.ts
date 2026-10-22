import { beforeEach, describe, expect, it, vi } from "vitest";
import * as locLinkedData from "../sources/locLinkedData.js";
import * as openLibrary from "../sources/openLibrary.js";
import * as wikidata from "../sources/wikidata.js";
import { getSubjectDetail } from "./subjectService.js";

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
});
