import { beforeEach, describe, expect, it, vi } from "vitest";
import * as openLibrary from "../sources/openLibrary.js";
import { searchBooks } from "./searchService.js";

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
    expect(openLibrary.searchWorks).toHaveBeenCalledWith("the martian");
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
});
