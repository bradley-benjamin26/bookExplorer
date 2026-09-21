import { afterEach, describe, expect, it, vi } from "vitest";
import { searchWorks } from "./openLibrary.js";

function mockSearchResponse(docs: unknown[]) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ docs }),
  }));
}

describe("searchWorks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps a well-formed result into a work with paired author id/name", async () => {
    vi.stubGlobal(
      "fetch",
      mockSearchResponse([
        {
          key: "/works/OL17091839W",
          title: "The Martian",
          author_name: ["Andy Weir"],
          author_key: ["OL7234434A"],
          cover_i: 11447888,
        },
      ])
    );

    const results = await searchWorks("the martian");
    expect(results).toEqual([
      {
        workId: "OL17091839W",
        title: "The Martian",
        authors: [{ openLibraryId: "OL7234434A", name: "Andy Weir" }],
        coverUrl: "https://covers.openlibrary.org/b/id/11447888-M.jpg",
      },
    ]);
  });

  it("skips a result with no work key rather than throwing", async () => {
    vi.stubGlobal(
      "fetch",
      mockSearchResponse([{ title: "No key here" }, { key: "/works/OL1W", title: "Has a key" }])
    );

    const results = await searchWorks("query");
    expect(results.map((r) => r.workId)).toEqual(["OL1W"]);
  });

  it("returns a null cover when cover_i is absent", async () => {
    vi.stubGlobal("fetch", mockSearchResponse([{ key: "/works/OL1W", title: "No Cover" }]));
    const [result] = await searchWorks("query");
    expect(result.coverUrl).toBeNull();
  });

  it("returns no authors when author_name/author_key are absent", async () => {
    vi.stubGlobal("fetch", mockSearchResponse([{ key: "/works/OL1W", title: "Anonymous" }]));
    const [result] = await searchWorks("query");
    expect(result.authors).toEqual([]);
  });

  it("zips author_name/author_key only as far as the shorter array extends, rather than misaligning them", async () => {
    vi.stubGlobal(
      "fetch",
      mockSearchResponse([
        {
          key: "/works/OL1W",
          title: "Mismatched Arrays",
          author_name: ["Author One", "Author Two"],
          author_key: ["OL1A"],
        },
      ])
    );
    const [result] = await searchWorks("query");
    expect(result.authors).toEqual([{ openLibraryId: "OL1A", name: "Author One" }]);
  });
});
