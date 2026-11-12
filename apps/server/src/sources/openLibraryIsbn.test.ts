import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetUpstreamState } from "../httpClient.js";
import { lookupByIsbn } from "./openLibrary.js";

type Reply = { ok: boolean; status?: number; json?: unknown };
function stub(brief: unknown, edition: Reply) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const r: Reply = url.includes("/api/volumes/brief/") ? { ok: true, json: brief } : edition;
      return { ok: r.ok, status: r.status ?? 200, json: async () => r.json };
    })
  );
}
const record = (data: object) => ({ records: { x: { data } } });

describe("lookupByIsbn", () => {
  beforeEach(() => resetUpstreamState());
  afterEach(() => vi.unstubAllGlobals());

  it("maps a brief record", async () => {
    stub(
      record({
        key: "/books/OL1M",
        title: "Dune",
        authors: [{ url: "https://openlibrary.org/authors/OL79034A/Frank_Herbert", name: "Frank Herbert" }],
        subjects: [{ name: "Science fiction", url: "x" }],
        cover: { medium: "m.jpg" },
      }),
      { ok: true, json: { works: [{ key: "/works/OL893415W" }], physical_format: "Paperback" } }
    );
    expect(await lookupByIsbn("9780441172719")).toMatchObject({
      title: "Dune",
      authors: [{ openLibraryId: "OL79034A", name: "Frank Herbert" }],
      subjects: ["Science fiction"],
      coverUrl: "m.jpg",
      workId: "OL893415W",
      editionId: "OL1M",
      format: "Paperback",
    });
  });

  it("reads notes given as a string or as { value }, and strips the trailer", async () => {
    const ed = { ok: true, json: {} };
    stub(record({ key: "/books/OL1M", notes: "Good.\r\n----------\r\nSource: x" }), ed);
    expect((await lookupByIsbn("1"))?.description).toBe("Good.");
    stub(record({ key: "/books/OL1M", notes: { value: "Plain" } }), ed);
    expect((await lookupByIsbn("2"))?.description).toBe("Plain");
  });

  it("returns null when records is empty", async () => {
    stub({ records: {} }, { ok: true, json: {} });
    expect(await lookupByIsbn("3")).toBeNull();
  });

  it("keeps the book when the edition lookup fails", async () => {
    stub(record({ key: "/books/OL1M", title: "Dune" }), { ok: false, status: 404 });
    expect(await lookupByIsbn("4")).toMatchObject({ title: "Dune", workId: null, format: null });
  });
});
