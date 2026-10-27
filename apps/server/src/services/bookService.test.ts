import { beforeEach, describe, expect, it, vi } from "vitest";
import * as googleBooks from "../sources/googleBooks.js";
import * as openLibrary from "../sources/openLibrary.js";
import { getBookDetail } from "./bookService.js";
import { getWorkDetail } from "./workService.js";

vi.mock("../sources/openLibrary.js", () => ({ lookupByIsbn: vi.fn() }));
vi.mock("./workService.js", () => ({ getWorkDetail: vi.fn() }));
vi.mock("../sources/googleBooks.js", () => ({ lookupByIsbn: vi.fn() }));
vi.mock("../sources/wikidata.js", () => ({ fetchGenres: vi.fn() }));
vi.mock("../sources/wikipedia.js", () => ({ fetchWikipediaExtract: vi.fn() }));
vi.mock("../sources/loc.js", () => ({ mergeTaggedTerms: vi.fn(() => []) }));
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
