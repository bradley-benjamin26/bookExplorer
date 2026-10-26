import { beforeEach, describe, expect, it, vi } from "vitest";
import * as openLibrary from "../sources/openLibrary.js";
import * as wikidata from "../sources/wikidata.js";
import { fetchWikipediaExtract } from "../sources/wikipedia.js";
import { UpstreamUnavailableError } from "../httpClient.js";
import { fetchMoreByAuthor } from "./bookEnrichment.js";
import { getAuthorDetail, getAuthorLinks } from "./authorService.js";

vi.mock("../sources/openLibrary.js", () => ({ getAuthor: vi.fn() }));
vi.mock("../sources/wikidata.js", () => ({
  searchAuthorQid: vi.fn(),
  fetchAuthorRelations: vi.fn(),
  fetchPseudonyms: vi.fn(),
}));
vi.mock("../sources/wikipedia.js", () => ({ fetchWikipediaExtract: vi.fn() }));
vi.mock("./bookEnrichment.js", () => ({ fetchMoreByAuthor: vi.fn() }));

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
