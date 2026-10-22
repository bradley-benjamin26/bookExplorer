import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findPath, graphNeighbours } from "../services/graphQuery.js";
import { resetUpstreamState } from "../httpClient.js";
import { upstreamErrorHandler } from "../upstreamErrorHandler.js";
import { booksRoutes } from "./books.js";
import { searchRoutes } from "./search.js";

// Open Library answers 429 with Retry-After: 120 to everything; no live calls.
const fetchMock = vi.fn(async () => ({ ok: false, status: 429, headers: new Headers({ "Retry-After": "120" }) }) as Response);

beforeEach(() => {
  resetUpstreamState();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function app() {
  const a = Fastify();
  a.setErrorHandler(upstreamErrorHandler);
  await a.register(searchRoutes);
  await a.register(booksRoutes);
  return a;
}

describe("required sources during an Open Library cooldown", () => {
  it("search answers 503 with Retry-After, then fails fast without fetching", async () => {
    const a = await app();
    const first = await a.inject({ url: "/api/search?q=dune+messiah" });
    expect(first.statusCode).toBe(503);
    expect(first.headers["retry-after"]).toBeDefined();
    const calls = fetchMock.mock.calls.length;
    const second = await a.inject({ url: "/api/search?q=another+book" });
    expect(second.statusCode).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    await a.close();
  });

  it("the book route answers 503 with Retry-After", async () => {
    const a = await app();
    const res = await a.inject({ url: "/api/books/isbn/9780306406157" });
    expect(res.statusCode).toBe(503);
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
    await a.close();
  });

  it("the path finder, through the real neighbours, ends with upstreamUnavailable quickly", async () => {
    const started = Date.now();
    const result = await findPath("author:OL1A", "author:OL2A", graphNeighbours);
    expect(result).toEqual({ found: false, reason: "upstreamUnavailable" });
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
