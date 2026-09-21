import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPseudonyms, isValidQid } from "./wikidata.js";

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
