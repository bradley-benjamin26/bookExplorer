import { afterEach, describe, expect, it, vi } from "vitest";
import { findWork, getAuthorWorks, searchWorks } from "./openLibrary.js";

function mockSearchResponse(docs: unknown[]) {
  return vi.fn(async (..._args: unknown[]) => ({
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

describe("getAuthorWorks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns each work's own authors", async () => {
    vi.stubGlobal(
      "fetch",
      mockSearchResponse([
        { key: "/works/OL1W", title: "House Corrino", author_name: ["Brian Herbert", "Kevin J. Anderson"], author_key: ["OL1A", "OL2A"] },
      ])
    );

    const [work] = await getAuthorWorks("OL1A");
    expect(work.authors).toEqual([
      { openLibraryId: "OL1A", name: "Brian Herbert" },
      { openLibraryId: "OL2A", name: "Kevin J. Anderson" },
    ]);
  });
});

describe("findWork", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("searches by title and author and returns the first work with its cover", async () => {
    const fetch = mockSearchResponse([{ key: "/works/OL15056578W", title: "Tehanu (The Earthsea Cycle, Book 4)", cover_i: 3347790 }]);
    vi.stubGlobal("fetch", fetch);
    expect(await findWork("Tehanu", "Ursula K. Le Guin")).toEqual({ workId: "OL15056578W", coverUrl: "https://covers.openlibrary.org/b/id/3347790-M.jpg" });
    const url = new URL(fetch.mock.calls[0][0] as string);
    expect(url.searchParams.get("title")).toBe("Tehanu");
    expect(url.searchParams.get("author")).toBe("Ursula K. Le Guin");
  });
  it("returns null when nothing matches", async () => {
    vi.stubGlobal("fetch", mockSearchResponse([]));
    expect(await findWork("Nope", "Nobody")).toBeNull();
  });
});
