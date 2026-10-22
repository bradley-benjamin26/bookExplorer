import { beforeEach, describe, expect, it, vi } from "vitest";
import * as openLibrary from "../sources/openLibrary.js";
import { buildQuery, searchBooks } from "./searchService.js";

vi.mock("../sources/openLibrary.js", () => ({
  searchWorks: vi.fn(),
}));

describe("searchBooks", () => {
  beforeEach(() => {
    vi.mocked(openLibrary.searchWorks).mockReset();
  });

  it("returns an empty array without calling Open Library for a blank query", async () => {
    const results = await searchBooks("   ");
    expect(results).toEqual([]);
    expect(openLibrary.searchWorks).not.toHaveBeenCalled();
  });

  it("returns an empty array without calling Open Library for a query under 3 characters", async () => {
    // Regression test: Open Library's own search endpoint rejects anything shorter than 3
    // characters with a 422, which a debounced search-as-you-type client will genuinely send
    // as an intermediate state while someone's still typing — this used to surface as an
    // unhandled 500 instead of being treated as "no results yet".
    const results = await searchBooks("Ur");
    expect(results).toEqual([]);
    expect(openLibrary.searchWorks).not.toHaveBeenCalled();
  });

  it("trims the query before searching", async () => {
    vi.mocked(openLibrary.searchWorks).mockResolvedValue([]);
    await searchBooks("  the martian  ");
    expect(openLibrary.searchWorks).toHaveBeenCalledWith("the martian", 20, undefined);
  });

  it("maps an Open Library search result onto the shared WorkRef shape", async () => {
    vi.mocked(openLibrary.searchWorks).mockResolvedValue([
      { workId: "OL1W", title: "A Book", authors: [{ openLibraryId: "OL1A", name: "An Author" }], coverUrl: null },
    ]);
    const results = await searchBooks("a book");
    expect(results).toEqual([
      { openLibraryWorkId: "OL1W", title: "A Book", authors: [{ openLibraryId: "OL1A", name: "An Author" }], coverUrl: null },
    ]);
  });

  it("caches a repeat query (same text, different casing/whitespace) instead of searching again", async () => {
    // A query unused by any other test in this file — searchBooks' cache is a
    // module-level singleton that persists across tests, so reusing a query
    // another test already searched would hit that stale cache entry here
    // instead of exercising this test's own two calls.
    vi.mocked(openLibrary.searchWorks).mockResolvedValue([]);
    await searchBooks("The Hobbit");
    await searchBooks("  the hobbit  ");
    expect(openLibrary.searchWorks).toHaveBeenCalledTimes(1);
  });

  it("searches by author filter alone and maps filters into the query", async () => {
    vi.mocked(openLibrary.searchWorks).mockResolvedValue([]);
    await searchBooks("", { author: "Ursula Le Guin", yearFrom: 1970, sort: "new" });
    expect(openLibrary.searchWorks).toHaveBeenCalledWith('author:"Ursula Le Guin" first_publish_year:[1970 TO *]', 20, "new");
  });

  it("does not search when only a year range is given", async () => {
    expect(await searchBooks("", { yearFrom: 1970 })).toEqual([]);
    expect(openLibrary.searchWorks).not.toHaveBeenCalled();
  });

  it("searches when a short q is paired with a long-enough author", async () => {
    vi.mocked(openLibrary.searchWorks).mockResolvedValue([]);
    await searchBooks("ab", { author: "Le Guin" });
    expect(openLibrary.searchWorks).toHaveBeenCalledTimes(1);
  });

  it("caches separately per filter", async () => {
    vi.mocked(openLibrary.searchWorks).mockResolvedValue([]);
    await searchBooks("dune cachekey");
    await searchBooks("dune cachekey", { language: "fre" });
    await searchBooks("dune cachekey", { sort: "old" });
    await searchBooks("dune cachekey", { yearTo: 1990 });
    expect(openLibrary.searchWorks).toHaveBeenCalledTimes(4);
  });
});

describe("buildQuery", () => {
  it("escapes quotes and backslashes so a value cannot break out", () => {
    expect(buildQuery("", { author: 'x" OR subject:"y\\' })).toBe('author:"x\\" OR subject:\\"y\\\\"');
  });

  it("builds closed and open year ranges", () => {
    expect(buildQuery("a", { yearFrom: 1900, yearTo: 1950 })).toBe("a first_publish_year:[1900 TO 1950]");
    expect(buildQuery("a", { yearTo: 1950 })).toBe("a first_publish_year:[* TO 1950]");
  });
});
