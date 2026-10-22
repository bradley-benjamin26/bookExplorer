import Fastify from "fastify";
import { describe, expect, it } from "vitest";
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
