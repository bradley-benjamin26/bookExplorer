import { afterEach, describe, expect, it, vi } from "vitest";
import { compareOrdinals, fetchSeries, fetchWorkSeries, fetchPseudonyms, isValidQid, searchAuthorQid, searchConceptQid, searchWorkQid } from "./wikidata.js";

describe("isValidQid", () => {
  it("accepts a well-formed QID", () => {
    expect(isValidQid("Q42")).toBe(true);
    expect(isValidQid("Q123456")).toBe(true);
  });

  it("rejects anything that isn't a QID", () => {
    // Open Library's remote_ids.wikidata field is free-text on a wiki anyone can edit, so
    // this has to fail closed on garbage rather than pass it through to a network request.
    expect(isValidQid("")).toBe(false);
    expect(isValidQid("42")).toBe(false);
    expect(isValidQid("Q0")).toBe(false);
    expect(isValidQid("Q01")).toBe(false);
    expect(isValidQid("QABC")).toBe(false);
    expect(isValidQid("Q42 ")).toBe(false);
  });
});

describe("wbGetEntities request coalescing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("only sends one HTTP request for concurrent calls asking about the same entity's claims", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        entities: { Q42: { claims: { P742: [{ mainsnak: { datavalue: { value: "Douglas Adams" } } }] } } },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const [a, b] = await Promise.all([fetchPseudonyms("Q42"), fetchPseudonyms("Q42")]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(["Douglas Adams"]);
    expect(b).toEqual(["Douglas Adams"]);
  });

  it("sends a fresh request for a later, non-concurrent call instead of reusing a stale one", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ entities: { Q42: { claims: {} } } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ entities: { Q42: { claims: {} } } }) });
    vi.stubGlobal("fetch", fetchMock);

    await fetchPseudonyms("Q42");
    await fetchPseudonyms("Q42");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("searchConceptQid", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const searchResponses = (byQuery: Record<string, { id: string; label: string; description: string }[]>) =>
    vi.fn(async (url: string) => {
      const query = new URL(url).searchParams.get("search") ?? "";
      return { ok: true, json: async () => ({ search: byQuery[query] ?? [] }) };
    });

  it("rejects a television series of the same name and finds the concept under its singular label", async () => {
    vi.stubGlobal(
      "fetch",
      searchResponses({
        ghosts: [{ id: "Q107122133", label: "Ghosts", description: "2021 American television series" }],
        ghost: [{ id: "Q45529", label: "ghost", description: "soul or spirit of a dead person" }],
      })
    );
    expect(await searchConceptQid("ghosts")).toBe("Q45529");
  });

  it("requires the result's label to be the subject's name, not just a near search hit", async () => {
    vi.stubGlobal(
      "fetch",
      searchResponses({ travel: [{ id: "Q9", label: "Travel Channel", description: "cable network" }] })
    );
    expect(await searchConceptQid("travel")).toBeNull();
  });
});

describe("searchAuthorQid", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubSearch = (search: { id: string; description: string }[]) =>
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ search }) })));

  it("matches a historian or philosopher", async () => {
    stubSearch([
      { id: "Q1", description: "American film" },
      { id: "Q2", description: "British historian" },
    ]);
    expect(await searchAuthorQid("Someone")).toBe("Q2");
  });

  it("returns null rather than guessing the first hit when none looks like an author", async () => {
    stubSearch([{ id: "Q1", description: "American film" }]);
    expect(await searchAuthorQid("Someone")).toBeNull();
  });
});

describe("searchWorkQid", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("searches without a trailing series suffix in parentheses", async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      json: async () => ({ search: [{ id: "Q2261855", description: "1990 novel by Ursula K. Le Guin" }] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await searchWorkQid("Tehanu (The Earthsea Cycle, Book 4)", "Ursula K. Le Guin")).toBe("Q2261855");
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("search")).toBe("Tehanu");
  });
});

describe("compareOrdinals", () => {
  it("sorts numerics by value, fractional between integers, non-numeric and missing last", () => {
    const sorted = ["10", "A", null, "2.5", "2", "1"].sort(compareOrdinals);
    expect(sorted).toEqual(["1", "2", "2.5", "10", "A", null]);
  });
});

describe("series lookups", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const seriesClaim = (id: string, ordinal?: string) => ({
    mainsnak: { datavalue: { value: { id } } },
    ...(ordinal && { qualifiers: { P1545: [{ datavalue: { value: ordinal } }] } }),
  });
  const entity = (label: string, claims: object = {}) => ({ labels: { en: { value: label } }, claims });

  function stubWikidata(entities: Record<string, object>, searchTitles: string[] = []) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("list=search")) return { ok: true, json: async () => ({ query: { search: searchTitles.map((title) => ({ title })) } }) };
        const ids = new URL(url).searchParams.get("ids")!.split("|");
        return { ok: true, json: async () => ({ entities: Object.fromEntries(ids.map((id) => [id, entities[id]])) }) };
      })
    );
  }

  it("returns null for a work with no series", async () => {
    stubWikidata({ Q1: entity("Book", {}) });
    expect(await fetchWorkSeries("Q1")).toBeNull();
  });

  it("keeps a non-numeric ordinal as text and collapses a duplicated series statement", async () => {
    stubWikidata({
      Q1: entity("Book", { P179: [seriesClaim("Q9", "A"), seriesClaim("Q9", "A")] }),
      Q9: entity("The Saga"),
    });
    expect(await fetchWorkSeries("Q1")).toEqual({ name: "The Saga", position: "A", wikidataId: "Q9" });
  });

  it("orders members, keeps 2.5 between 2 and 3, and lists an Open Library id found on two items once", async () => {
    const ol = (id: string) => ({ P648: [{ mainsnak: { datavalue: { value: id } } }] });
    stubWikidata(
      {
        Q9: entity("The Saga"),
        Q3: entity("Three", { ...ol("OL3W"), P179: [seriesClaim("Q9", "3")] }),
        Q2: entity("Two", { ...ol("OL2W"), P179: [seriesClaim("Q9", "2")] }),
        Q25: entity("Two and a half", { P179: [seriesClaim("Q9", "2.5")] }),
        Q22: entity("Two (dup)", { ...ol("OL2W"), P179: [seriesClaim("Q9", "2")] }),
      },
      ["Q3", "Q2", "Q25", "Q22"]
    );
    const series = await fetchSeries("Q9");
    expect(series?.members.map((m) => m.title)).toEqual(["Two", "Two and a half", "Three"]);
    expect(series?.members[1]).toMatchObject({ position: "2.5", openLibraryWorkId: null });
  });

  it("only links a member to Open Library when the id is a work id, not an edition", async () => {
    const ol = (id: string) => ({ P648: [{ mainsnak: { datavalue: { value: id } } }] });
    stubWikidata(
      { Q9: entity("The Saga"), Q1: entity("One", { ...ol("OL1M"), P179: [seriesClaim("Q9", "1")] }) },
      ["Q1"]
    );
    const series = await fetchSeries("Q9");
    expect(series?.members[0]).toMatchObject({ title: "One", openLibraryWorkId: null });
  });

  it("leaves out a member that is part of (P361) another member, like a volume's inner books", async () => {
    const partOf = (id: string) => ({ P361: [{ mainsnak: { datavalue: { value: { id } } } }] });
    stubWikidata(
      {
        Q9: entity("The Lord of the Rings"),
        Q1: entity("The Fellowship of the Ring", { P179: [seriesClaim("Q9", "1")] }),
        Q11: entity("The First Journey", { ...partOf("Q1"), P179: [seriesClaim("Q9", "1")] }),
      },
      ["Q1", "Q11"]
    );
    expect((await fetchSeries("Q9"))?.members.map((m) => m.title)).toEqual(["The Fellowship of the Ring"]);
  });

  it("leaves out a prologue (P31 Q920285)", async () => {
    const instanceOf = (id: string) => ({ P31: [{ mainsnak: { datavalue: { value: { id } } } }] });
    stubWikidata(
      {
        Q9: entity("The Saga"),
        Q1: entity("One", { P179: [seriesClaim("Q9", "1")] }),
        Q2: entity("Prologue", { ...instanceOf("Q920285"), P179: [seriesClaim("Q9")] }),
      },
      ["Q1", "Q2"]
    );
    expect((await fetchSeries("Q9"))?.members.map((m) => m.title)).toEqual(["One"]);
  });

  it("returns null for a malformed qid without calling out", async () => {
    stubWikidata({});
    expect(await fetchSeries("nope")).toBeNull();
  });
});
