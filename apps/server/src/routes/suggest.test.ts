import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { suggestRoutes } from "./suggest.js";

async function get(url: string) {
  const app = Fastify();
  await app.register(suggestRoutes);
  const res = await app.inject({ method: "GET", url });
  await app.close();
  return res;
}
const stubFetch = (res: Response) => {
  const fn = vi.fn().mockResolvedValue(res);
  vi.stubGlobal("fetch", fn);
  return fn;
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/suggest/:vocab", () => {
  it("maps LOC labels, rewriting -- to ' -- '", async () => {
    stubFetch(json({ hits: [{ aLabel: "Science fiction--Authorship" }] }));
    const res = await get("/api/suggest/subjects?q=science fiction auth");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(["Science fiction -- Authorship"]);
  });

  it.each(["", "?q=a", `?q=${"x".repeat(101)}`])("returns 400 for bad q %#", async (qs) => {
    const fetchFn = stubFetch(json({ hits: [] }));
    expect((await get(`/api/suggest/subjects${qs}`)).statusCode).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown vocabulary", async () => {
    expect((await get("/api/suggest/names?q=abc")).statusCode).toBe(400);
    expect((await get("/api/suggest/constructor?q=abc")).statusCode).toBe(400);
  });

  it("returns [] when LOC answers 500", async () => {
    stubFetch(json({}, 500));
    const res = await get("/api/suggest/genres?q=novel");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("URL-encodes q into the upstream URL", async () => {
    const fetchFn = stubFetch(json({ hits: [] }));
    await get("/api/suggest/genres?q=" + encodeURIComponent("zz&count=9999"));
    const url = String(fetchFn.mock.calls[0][0]);
    expect(url).toBe("https://id.loc.gov/authorities/genreForms/suggest2?q=zz%26count%3D9999&count=8");
  });
});
