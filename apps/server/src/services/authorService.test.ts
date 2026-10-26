import { describe, expect, it, vi } from "vitest";
import * as openLibrary from "../sources/openLibrary.js";
import * as wikidata from "../sources/wikidata.js";
import { fetchWikipediaExtract } from "../sources/wikipedia.js";
import { getAuthorDetail } from "./authorService.js";

vi.mock("../sources/openLibrary.js", () => ({ getAuthor: vi.fn(), getAuthorWorks: vi.fn() }));
vi.mock("../sources/wikidata.js", () => ({ searchAuthorQid: vi.fn(), fetchAuthorRelations: vi.fn(), fetchPseudonyms: vi.fn() }));
vi.mock("../sources/wikipedia.js", () => ({ fetchWikipediaExtract: vi.fn() }));

describe("getAuthorDetail", () => {
  it("serves Open Library's data when Wikidata and Wikipedia fail", async () => {
    vi.mocked(openLibrary.getAuthor).mockResolvedValue({ name: "Margaret Atwood", bio: "Canadian author.", birthDate: "1939", deathDate: null, wikidataId: "Q183492" });
    vi.mocked(openLibrary.getAuthorWorks).mockResolvedValue([]);
    vi.mocked(wikidata.fetchAuthorRelations).mockRejectedValue(new Error("SPARQL timed out"));
    vi.mocked(wikidata.fetchPseudonyms).mockRejectedValue(new Error("SPARQL timed out"));
    vi.mocked(fetchWikipediaExtract).mockRejectedValue(new Error("Wikipedia timed out"));

    const author = await getAuthorDetail("OL1A");
    expect(author).toMatchObject({ name: "Margaret Atwood", bio: "Canadian author.", bioSource: "openLibrary", relations: [], pseudonyms: [] });
  });
});
