import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { PathResultSchema, type PathResult } from "@book-explorer/shared";
import { describe, expect, it, vi } from "vitest";
import { findPath } from "../services/graphQuery.js";
import { pathRoutes } from "./path.js";

vi.mock("../services/graphQuery.js", () => ({ findPath: vi.fn(), graphNeighbours: vi.fn() }));

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

describe("GET /api/path search", () => {
  it("returns the ranked paths in the shared response shape", async () => {
    const found: PathResult = {
      found: true,
      paths: [
        {
          nodes: [
            { id: "work:OL1W", type: "work", label: "Wolf Hall", navigable: true },
            { id: "subject:tudors", type: "subject", label: "Tudors", navigable: true },
            { id: "work:OL2W", type: "work", label: "The Mirror and the Light", navigable: true },
          ],
          edges: [
            { source: "work:OL1W", relation: "subject", target: "subject:tudors" },
            { source: "work:OL2W", relation: "subject", target: "subject:tudors" },
          ],
          summary: "Both: Tudors",
        },
      ],
    };
    vi.mocked(findPath).mockResolvedValueOnce(found);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/path?from=work:OL1W&to=work:OL2W" });
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(PathResultSchema.parse(res.json())).toEqual(found);
  });

  it("aborts the search when the client disconnects", async () => {
    let signal: AbortSignal | undefined;
    vi.mocked(findPath).mockImplementationOnce((_from, _to, _neighbours, _limits, s) => {
      signal = s;
      return new Promise((resolve) => s?.addEventListener("abort", () => resolve({ found: false, reason: "timeout" })));
    });
    const app = await buildApp();
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as { port: number };
    const client = new AbortController();
    const request = fetch(`http://127.0.0.1:${port}/api/path?from=work:OL1W&to=work:OL2W`, { signal: client.signal });
    await vi.waitFor(() => expect(signal).toBeDefined());
    expect(signal?.aborted).toBe(false);
    client.abort();
    await expect(request).rejects.toThrow();
    await vi.waitFor(() => expect(signal?.aborted).toBe(true));
    await app.close();
  });
});
