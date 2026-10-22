import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { describe, expect, it } from "vitest";
import { pathRoutes } from "./path.js";

async function buildApp() {
  const app = Fastify();
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  await app.register(pathRoutes);
  return app;
}

describe("GET /api/path validation", () => {
  it.each([
    "",
    "from=work:OL1W",
    "from=work:OL1W&to=work:OL1W",
    "from=work:OL1A&to=author:OL2A",
    "from=author:OL1W&to=work:OL2W",
    "from=OL1W&to=work:OL2W",
    "from=genre:fiction&to=work:OL2W",
    "from=editions:OL1W&to=work:OL2W",
    "from=subject:Science%20Fiction&to=work:OL2W",
    "from=subject:&to=work:OL2W",
    "from=work:OL1W&from=work:OL3W&to=work:OL2W",
  ])("returns 400 for %s", async (qs) => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: `/api/path?${qs}` });
    await app.close();
    expect(res.statusCode).toBe(400);
  });

  it("is limited more tightly than the global 100 a minute", async () => {
    const app = await buildApp();
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await app.inject({ method: "GET", url: "/api/path" })).statusCode);
    await app.close();
    expect(codes.slice(0, 10).every((c) => c === 400)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});
