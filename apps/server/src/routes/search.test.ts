import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { searchRoutes } from "./search.js";

describe("GET /api/search validation", () => {
  it.each(["q=a&q=b", "q=dune&author=a&author=b", "q=dune&yearFrom=19x0"])("returns 400 for %s", async (qs) => {
    const app = Fastify();
    await app.register(searchRoutes);
    const res = await app.inject({ method: "GET", url: `/api/search?${qs}` });
    await app.close();
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/search/authors", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns [] for a query under 3 characters without calling upstream", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const app = Fastify();
    await app.register(searchRoutes);
    const res = await app.inject({ method: "GET", url: "/api/search/authors?q=ab" });
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps Open Library's author docs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ docs: [{ key: "OL1A", name: "Timothy Zahn", extra: 1 }] }));
    vi.stubGlobal("fetch", fetchMock);
    const app = Fastify();
    await app.register(searchRoutes);
    const res = await app.inject({ method: "GET", url: "/api/search/authors?q=zahn" });
    await app.close();
    expect(res.json()).toEqual([{ openLibraryId: "OL1A", name: "Timothy Zahn" }]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("limit=5");
  });
});
