import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBroaderNarrower, findSubjectHeadingUri } from "./locLinkedData.js";

function mockJsonResponse(body: unknown, ok = true) {
  return vi.fn(async () => ({ ok, json: async () => body }));
}

describe("findSubjectHeadingUri", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the uri of a hit whose aLabel exactly matches the query, case-insensitively", async () => {
    vi.stubGlobal(
      "fetch",
      mockJsonResponse({
        q: "fairy tales",
        hits: [
          { aLabel: "Fairy tales--Adaptations", uri: "http://id.loc.gov/authorities/subjects/sh00000001" },
          { aLabel: "Fairy tales", uri: "http://id.loc.gov/authorities/subjects/sh85046925" },
        ],
      })
    );

    const uri = await findSubjectHeadingUri("fairy tales");
    expect(uri).toBe("http://id.loc.gov/authorities/subjects/sh85046925");
  });

  it("rejects a left-anchored near-miss that isn't an exact label match", async () => {
    vi.stubGlobal(
      "fetch",
      mockJsonResponse({
        q: "Fairy tales",
        hits: [{ aLabel: "Fairy tales--Adaptations", uri: "http://id.loc.gov/authorities/subjects/sh00000001" }],
      })
    );

    const uri = await findSubjectHeadingUri("Fairy tales");
    expect(uri).toBeNull();
  });

  it("returns null when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      })
    );

    const uri = await findSubjectHeadingUri("Fairy tales");
    expect(uri).toBeNull();
  });

  it("returns null when there are no hits at all", async () => {
    vi.stubGlobal("fetch", mockJsonResponse({ q: "Zzzznonexistentsubjectzzzz", hits: [] }));

    const uri = await findSubjectHeadingUri("Zzzznonexistentsubjectzzzz");
    expect(uri).toBeNull();
  });
});

describe("fetchBroaderNarrower", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const TOP_URI = "http://id.loc.gov/authorities/subjects/sh85046925";
  const BROADER_1 = "http://id.loc.gov/authorities/subjects/sh85023780";
  const BROADER_2 = "http://id.loc.gov/authorities/subjects/sh85065164";
  const NARROWER_1 = "http://id.loc.gov/authorities/subjects/sh00000011";
  const NARROWER_2 = "http://id.loc.gov/authorities/subjects/sh00000012";

  function prefLabelEntry(id: string, label: string) {
    return [{ "@id": id, "http://www.w3.org/2004/02/skos/core#prefLabel": [{ "@value": label, "@language": "en" }] }];
  }

  it("resolves broader and narrower uris to their labels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === `${TOP_URI}.skos.json`) {
          return {
            ok: true,
            json: async () => [
              {
                "@id": TOP_URI,
                "http://www.w3.org/2004/02/skos/core#broader": [{ "@id": BROADER_1 }, { "@id": BROADER_2 }],
                "http://www.w3.org/2004/02/skos/core#narrower": [{ "@id": NARROWER_1 }, { "@id": NARROWER_2 }],
              },
            ],
          };
        }
        if (url === `${BROADER_1}.skos.json`) return { ok: true, json: async () => prefLabelEntry(BROADER_1, "Tales") };
        if (url === `${BROADER_2}.skos.json`)
          return { ok: true, json: async () => prefLabelEntry(BROADER_2, "Children's stories") };
        if (url === `${NARROWER_1}.skos.json`)
          return { ok: true, json: async () => prefLabelEntry(NARROWER_1, "Fairy tales--Adaptations") };
        if (url === `${NARROWER_2}.skos.json`)
          return { ok: true, json: async () => prefLabelEntry(NARROWER_2, "Fairy tales--History and criticism") };
        return { ok: false, json: async () => ({}) };
      })
    );

    const result = await fetchBroaderNarrower(TOP_URI);
    expect(result.broader).toEqual(["Tales", "Children's stories"]);
    expect(result.narrower.length).toBe(2);
  });

  it("drops a broader/narrower term whose own lookup fails, without failing the whole call", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === `${TOP_URI}.skos.json`) {
          return {
            ok: true,
            json: async () => [
              {
                "@id": TOP_URI,
                "http://www.w3.org/2004/02/skos/core#broader": [{ "@id": BROADER_1 }, { "@id": BROADER_2 }],
              },
            ],
          };
        }
        if (url === `${BROADER_1}.skos.json`) return { ok: true, json: async () => prefLabelEntry(BROADER_1, "Tales") };
        if (url === `${BROADER_2}.skos.json`) throw new Error("network error");
        return { ok: false, json: async () => ({}) };
      })
    );

    const result = await fetchBroaderNarrower(TOP_URI);
    expect(result.broader.length).toBe(1);
  });

  it("caps broader and narrower lookups to 20 each, even when SKOS lists more", async () => {
    const broaderUris = Array.from(
      { length: 25 },
      (_, i) => `http://id.loc.gov/authorities/subjects/sh1000${String(i).padStart(4, "0")}`
    );
    const narrowerUris = Array.from(
      { length: 25 },
      (_, i) => `http://id.loc.gov/authorities/subjects/sh2000${String(i).padStart(4, "0")}`
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === `${TOP_URI}.skos.json`) {
          return {
            ok: true,
            json: async () => [
              {
                "@id": TOP_URI,
                "http://www.w3.org/2004/02/skos/core#broader": broaderUris.map((id) => ({ "@id": id })),
                "http://www.w3.org/2004/02/skos/core#narrower": narrowerUris.map((id) => ({ "@id": id })),
              },
            ],
          };
        }
        const match = [...broaderUris, ...narrowerUris].find((id) => url === `${id}.skos.json`);
        if (match) return { ok: true, json: async () => prefLabelEntry(match, "Label") };
        return { ok: false, json: async () => ({}) };
      })
    );

    const result = await fetchBroaderNarrower(TOP_URI);
    expect(result.broader.length).toBe(20);
    expect(result.narrower.length).toBe(20);
  });

  it("returns empty arrays when the uri has neither broader nor narrower terms", async () => {
    const uri = "http://id.loc.gov/authorities/subjects/sh00000000";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [{ "@id": uri }],
      }))
    );

    const result = await fetchBroaderNarrower(uri);
    expect(result).toEqual({ broader: [], narrower: [] });
  });
});
