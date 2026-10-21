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
    vi.mocked(locLinkedData.fetchBroaderNarrower).mockResolvedValue({ broader: ["Tales"], narrower: [] });

    const subject = await getSubjectDetail("fairy_tales");
    expect(subject?.relatedConcepts).toEqual([
      { relation: "broader", label: "Tales", sources: ["wikidata", "lcsh"], wikidataId: "Q999" },
    ]);
  });

  it("includes an LCSH-only concept with a null wikidataId", async () => {
    mockOpenLibrarySubject("Fairy tales (LCSH only)");
    vi.mocked(wikidata.searchConceptQid).mockResolvedValue(null);
    vi.mocked(wikidata.fetchRelatedConcepts).mockResolvedValue([]);
    vi.mocked(locLinkedData.findSubjectHeadingUri).mockResolvedValue("https://id.loc.gov/authorities/subjects/sh456");
    vi.mocked(locLinkedData.fetchBroaderNarrower).mockResolvedValue({ broader: ["Folklore"], narrower: [] });

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
    vi.mocked(locLinkedData.fetchBroaderNarrower).mockResolvedValue({ broader: [], narrower: [] });

    const subject = await getSubjectDetail("fairy_tales_no_lcsh");
    expect(subject?.relatedConcepts).toEqual([
      { relation: "broader", label: "Tales", sources: ["wikidata"], wikidataId: "Q999" },
    ]);
  });
});
