import { beforeEach, describe, expect, it, vi } from "vitest";
import * as googleBooks from "../sources/googleBooks.js";
import * as openLibrary from "../sources/openLibrary.js";
import * as loc from "../sources/loc.js";
import * as subjectCanon from "./subjectCanon.js";
import { startCommonEnrichment } from "./bookEnrichment.js";
import { getBookDetail } from "./bookService.js";
import { getWorkDetail } from "./workService.js";

vi.mock("../sources/openLibrary.js", () => ({ lookupByIsbn: vi.fn() }));
vi.mock("./workService.js", () => ({ getWorkDetail: vi.fn() }));
vi.mock("../sources/googleBooks.js", () => ({ lookupByIsbn: vi.fn() }));
vi.mock("../sources/wikidata.js", () => ({ fetchGenres: vi.fn() }));
vi.mock("../sources/wikipedia.js", () => ({ fetchWikipediaExtract: vi.fn() }));
vi.mock("../sources/loc.js", () => ({ mergeTaggedTerms: vi.fn(() => []) }));
vi.mock("./subjectCanon.js", () => ({ canonicalizeSubjects: vi.fn(async () => new Map()) }));
vi.mock("./bookEnrichment.js", () => ({
  startCommonEnrichment: vi.fn(() => ({
    locMetadataPromise: Promise.resolve({ subjects: [], genres: [], lcc: null, ddc: null, lccn: null, summary: null }),
    hardcoverPromise: Promise.resolve({ coverUrl: "hc.jpg", rating: 4, ratingsCount: 10 }),
    olRatingsPromise: Promise.resolve(null),
  })),
  blendHardcoverAndOpenLibraryRating: vi.fn(() => ({ average: 4, count: 10, sources: ["hardcover"] })),
  findWorkQid: vi.fn(async () => null),
  optionalSource: vi.fn(() => () => null),
}));

describe("getBookDetail description", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks Google Books, and prefers its description, when Open Library only has notes and Wikipedia has no match", async () => {
    vi.mocked(openLibrary.lookupByIsbn).mockResolvedValue({
      title: "T",
      authors: [{ name: "A" }],
      subjects: [],
      coverUrl: "ol.jpg",
      description: "USA/CAN",
      workId: "OL1W",
    } as never);
    vi.mocked(googleBooks.lookupByIsbn).mockResolvedValue({ description: "A real synopsis.", coverUrl: null, rating: null });

    const book = await getBookDetail("9780000000001");

    expect(googleBooks.lookupByIsbn).toHaveBeenCalled();
    expect(book?.description).toBe("A real synopsis.");
  });
});

describe("getBookDetail non-English description", () => {
  beforeEach(() => vi.clearAllMocks());

  it("drops a Spanish Open Library description and falls through to Google Books", async () => {
    vi.mocked(openLibrary.lookupByIsbn).mockResolvedValue({
      title: "T",
      authors: [{ name: "A" }],
      subjects: [],
      coverUrl: "ol.jpg",
      description: "Bilbo Bolsón es un hobbit que vive cómodamente en su agujero hasta el día en que el mago Gandalf lo elige para una aventura.",
      workId: "OL1W",
    } as never);
    vi.mocked(googleBooks.lookupByIsbn).mockResolvedValue({ description: "A real synopsis.", coverUrl: null, rating: null });

    const book = await getBookDetail("9780000000003");

    expect(book?.description).toBe("A real synopsis.");
    expect(book?.descriptionSource).toBe("googleBooks");
  });

  it("has no description when every source is non-English", async () => {
    vi.mocked(openLibrary.lookupByIsbn).mockResolvedValue({
      title: "T",
      authors: [{ name: "A" }],
      subjects: [],
      coverUrl: "ol.jpg",
      description: "Bilbo Bolsón es un hobbit que vive cómodamente en su agujero hasta el día en que el mago Gandalf lo elige para una aventura.",
      workId: "OL1W",
    } as never);
    vi.mocked(googleBooks.lookupByIsbn).mockResolvedValue(null);

    const book = await getBookDetail("9780000000004");

    expect(book?.description).toBeNull();
    expect(book?.descriptionSource).toBeNull();
  });
});

describe("getBookDetail authors", () => {
  beforeEach(() => vi.clearAllMocks());

  it("falls back to the work's authors when the edition lists none", async () => {
    vi.mocked(openLibrary.lookupByIsbn).mockResolvedValue({
      title: "Atomic Habits",
      authors: [],
      subjects: [],
      coverUrl: "ol.jpg",
      description: null,
      workId: "OL1W",
    } as never);
    vi.mocked(getWorkDetail).mockResolvedValue({ authors: [{ openLibraryId: "OL9A", name: "James Clear" }] } as never);

    const book = await getBookDetail("9780000000002");

    expect(book?.authors).toEqual([{ openLibraryId: "OL9A", name: "James Clear" }]);
  });
});

describe("getBookDetail LOC summary", () => {
  beforeEach(() => vi.clearAllMocks());

  const withLoc = (loc: { lccn: string | null; summary: string | null }) => {
    vi.mocked(openLibrary.lookupByIsbn).mockResolvedValue({
      title: "T", authors: [{ name: "A" }], subjects: [], coverUrl: "ol.jpg", description: null, workId: "OL1W",
    } as never);
    vi.mocked(googleBooks.lookupByIsbn).mockResolvedValue(null);
    vi.mocked(startCommonEnrichment).mockReturnValueOnce({
      locMetadataPromise: Promise.resolve({ subjects: [], genres: [], lcc: "PS1", ddc: "813", ...loc }),
      hardcoverPromise: Promise.resolve(null),
      olRatingsPromise: Promise.resolve(null),
    } as unknown as ReturnType<typeof startCommonEnrichment>);
  };

  it("uses the LOC summary, credited to loc, when no other source has a description", async () => {
    withLoc({ lccn: "2001012345", summary: "A summary from the catalog." });
    const book = await getBookDetail("9780000000010");
    expect(book?.description).toBe("A summary from the catalog.");
    expect(book?.descriptionSource).toBe("loc");
    expect(book?.loc).toEqual({ lcc: "PS1", ddc: "813", lccn: "2001012345" });
  });

  describe("getBookDetail subject canonicalization", () => {
    beforeEach(() => vi.clearAllMocks());

    it("canonicalizes LOC and Open Library subjects together, only for the subject merge", async () => {
      const canon = new Map([
        ["Horror tales, American", {
          uri: "sh85062085", heading: "Horror tales, American", display: "American horror tales", slug: "horror_tales_american", variants: [],
        }],
        ["American horror tales", {
          uri: "sh85062085", heading: "Horror tales, American", display: "American horror tales", slug: "horror_tales_american", variants: [],
        }],
      ]);
      vi.mocked(subjectCanon.canonicalizeSubjects).mockResolvedValue(canon);
      vi.mocked(openLibrary.lookupByIsbn).mockResolvedValue({
        title: "T", authors: [{ name: "A" }], subjects: ["American horror tales"], coverUrl: "ol.jpg",
        description: null, workId: null,
      } as never);
      vi.mocked(startCommonEnrichment).mockReturnValueOnce({
        locMetadataPromise: Promise.resolve({
          subjects: ["Horror tales, American"], genres: [], lcc: null, ddc: null, lccn: null, summary: null,
        }),
        hardcoverPromise: Promise.resolve(null),
        olRatingsPromise: Promise.resolve(null),
      } as unknown as ReturnType<typeof startCommonEnrichment>);
      vi.mocked(googleBooks.lookupByIsbn).mockResolvedValue(null);

      await getBookDetail("9780000000020");

      expect(subjectCanon.canonicalizeSubjects).toHaveBeenCalledWith(["Horror tales, American", "American horror tales"], expect.any(Object));
      expect(loc.mergeTaggedTerms).toHaveBeenCalledWith([
        { source: "lcsh", labels: ["Horror tales, American"] },
        { source: "openLibrary", labels: ["American horror tales"] },
      ], canon);
      expect(loc.mergeTaggedTerms).toHaveBeenCalledWith([
        { source: "lcsh", labels: [] },
        { source: "wikidata", labels: [] },
      ]);
    });
  });

  it("omits loc, and ignores the LOC summary, when there is no LCCN", async () => {
    withLoc({ lccn: null, summary: "An uncredited summary." });
    const book = await getBookDetail("9780000000011");
    expect(book?.loc).toBeUndefined();
    expect(book?.description).toBeNull();
    expect(book?.descriptionSource).toBeNull();
  });

  it("carries hardcoverSlug from the Hardcover data, null when Hardcover has none", async () => {
    withLoc({ lccn: null, summary: null });
    // Reset drops withLoc's queued null-Hardcover value so this one is the one used.
    vi.mocked(startCommonEnrichment).mockReset().mockReturnValueOnce({
      locMetadataPromise: Promise.resolve({ subjects: [], genres: [], lcc: null, ddc: null, lccn: null, summary: null }),
      hardcoverPromise: Promise.resolve({ slug: "dune", coverUrl: null, rating: null, ratingsCount: 0 }),
      olRatingsPromise: Promise.resolve(null),
    } as unknown as ReturnType<typeof startCommonEnrichment>);
    expect((await getBookDetail("9780000000021"))?.hardcoverSlug).toBe("dune");
    withLoc({ lccn: null, summary: null });
    expect((await getBookDetail("9780000000022"))?.hardcoverSlug).toBeNull();
  });
});
