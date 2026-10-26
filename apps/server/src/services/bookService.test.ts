import { beforeEach, describe, expect, it, vi } from "vitest";
import * as googleBooks from "../sources/googleBooks.js";
import * as openLibrary from "../sources/openLibrary.js";
import { getBookDetail } from "./bookService.js";

vi.mock("../sources/openLibrary.js", () => ({ lookupByIsbn: vi.fn() }));
vi.mock("../sources/googleBooks.js", () => ({ lookupByIsbn: vi.fn() }));
vi.mock("../sources/wikidata.js", () => ({ fetchGenres: vi.fn() }));
vi.mock("../sources/wikipedia.js", () => ({ fetchWikipediaExtract: vi.fn() }));
vi.mock("../sources/loc.js", () => ({ mergeTaggedTerms: vi.fn(() => []) }));
vi.mock("./bookEnrichment.js", () => ({
  startCommonEnrichment: vi.fn(() => ({
    locMetadataPromise: Promise.resolve({ subjects: [], genres: [] }),
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
