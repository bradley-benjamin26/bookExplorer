import { beforeEach, describe, expect, it, vi } from "vitest";
import * as openLibrary from "../sources/openLibrary.js";
import * as wikidata from "../sources/wikidata.js";
import { fetchWikipediaExtract } from "../sources/wikipedia.js";
import { UpstreamUnavailableError } from "../httpClient.js";
import { fetchMoreByAuthor } from "./bookEnrichment.js";
import { getAuthorDetail, getAuthorLinks } from "./authorService.js";

vi.mock("../sources/openLibrary.js", () => ({ getAuthor: vi.fn(), getAuthorWorks: vi.fn() }));
vi.mock("../sources/wikidata.js", () => ({
  searchAuthorQid: vi.fn(),
  fetchAuthorRelations: vi.fn(),
  fetchPseudonyms: vi.fn(),
}));
vi.mock("../sources/wikipedia.js", () => ({ fetchWikipediaExtract: vi.fn() }));
vi.mock("./bookEnrichment.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./bookEnrichment.js")>()),
  fetchMoreByAuthor: vi.fn(),
}));

describe("getAuthorDetail", () => {
  it("serves Open Library's data when Wikidata and Wikipedia fail", async () => {
    vi.mocked(openLibrary.getAuthor).mockResolvedValue({ name: "Margaret Atwood", bio: "Canadian author.", birthDate: "1939", deathDate: null, wikidataId: "Q183492" });
    vi.mocked(openLibrary.getAuthorWorks).mockResolvedValue([]);
    vi.mocked(wikidata.fetchAuthorRelations).mockRejectedValue(new Error("SPARQL timed out"));
    vi.mocked(wikidata.fetchPseudonyms).mockRejectedValue(new Error("SPARQL timed out"));
    vi.mocked(fetchWikipediaExtract).mockRejectedValue(new Error("Wikipedia timed out"));

    const author = await getAuthorDetail("OL9A");
    expect(author).toMatchObject({ name: "Margaret Atwood", bio: "Canadian author.", bioSource: "openLibrary", relations: [], pseudonyms: [] });
  });
});

describe("getAuthorDetail photo", () => {
  beforeEach(() => {
    vi.mocked(openLibrary.getAuthor).mockReset().mockResolvedValue({ name: "Timothy Zahn", bio: null, birthDate: null, deathDate: null, wikidataId: "Q1" });
    vi.mocked(openLibrary.getAuthorWorks).mockReset().mockResolvedValue([]);
    vi.mocked(wikidata.fetchAuthorRelations).mockReset().mockResolvedValue([]);
    vi.mocked(wikidata.fetchPseudonyms).mockReset().mockResolvedValue([]);
    vi.mocked(fetchMoreByAuthor).mockReset().mockResolvedValue([]);
  });

  it("uses the Wikipedia thumbnail as photoUrl", async () => {
    vi.mocked(fetchWikipediaExtract).mockReset().mockResolvedValue({ text: "Bio.", url: "https://en.wikipedia.org/wiki/Z", imageUrl: "https://upload.wikimedia.org/x.jpg" });
    expect((await getAuthorDetail("OL10A"))?.photoUrl).toBe("https://upload.wikimedia.org/x.jpg");
  });

  it("has a null photoUrl without a Wikipedia match", async () => {
    vi.mocked(fetchWikipediaExtract).mockReset().mockResolvedValue(null);
    expect((await getAuthorDetail("OL11A"))?.photoUrl).toBeNull();
  });
});

describe("getAuthorLinks", () => {
  beforeEach(() => {
    vi.mocked(openLibrary.getAuthor).mockReset().mockResolvedValue({
      name: "Frank Herbert",
      wikidataId: "Q7934",
      bio: null,
      birthDate: null,
      deathDate: null,
    } as unknown as Awaited<ReturnType<typeof openLibrary.getAuthor>>);
    vi.mocked(wikidata.fetchAuthorRelations).mockReset().mockResolvedValue([]);
    vi.mocked(wikidata.fetchPseudonyms).mockReset().mockResolvedValue(["Frank Herbert", "F. P. Herbert"]);
    vi.mocked(fetchWikipediaExtract).mockReset().mockResolvedValue(null);
    vi.mocked(fetchMoreByAuthor).mockReset().mockResolvedValue([]);
    vi.mocked(openLibrary.getAuthorWorks).mockReset().mockResolvedValue([]);
  });

  it("fetches no Wikipedia extract or more-by-author list", async () => {
    const links = await getAuthorLinks("OL1A");
    expect(fetchWikipediaExtract).not.toHaveBeenCalled();
    expect(fetchMoreByAuthor).not.toHaveBeenCalled();
    expect(links).toEqual({ openLibraryId: "OL1A", name: "Frank Herbert", relations: [], pseudonyms: ["F. P. Herbert"] });
  });

  it("reuses a fully loaded author when one is already cached", async () => {
    await getAuthorDetail("OL2A");
    const links = await getAuthorLinks("OL2A");
    expect(openLibrary.getAuthor).toHaveBeenCalledTimes(1);
    expect(links?.name).toBe("Frank Herbert");
  });

  it("never stands in for the full author on the author page", async () => {
    await getAuthorLinks("OL3A");
    await getAuthorDetail("OL3A");
    expect(fetchWikipediaExtract).toHaveBeenCalledTimes(1);
  });

  it("lets an Open Library cooldown through", async () => {
    vi.mocked(openLibrary.getAuthor).mockRejectedValueOnce(new UpstreamUnavailableError("openlibrary.org", 60_000));
    await expect(getAuthorLinks("OL4A")).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});
