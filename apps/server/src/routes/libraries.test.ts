import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { LibraryAvailabilitySchema, SupportedLibrarySchema } from "@book-explorer/shared";
import { describe, expect, it, vi } from "vitest";
import { Z3950UnavailableError } from "../z3950/client.js";
import { Z3950_LIBRARIES } from "../z3950/registry.js";
import { getLibraryAvailability } from "../services/libraryAvailability.js";
import { librariesRoutes } from "./libraries.js";

vi.mock("../services/libraryAvailability.js", () => ({ getLibraryAvailability: vi.fn() }));
const svc = vi.mocked(getLibraryAvailability);

async function buildApp() {
  const app = Fastify();
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  await app.register(librariesRoutes);
  return app;
}
const get = async (url: string) => { const app = await buildApp(); const r = await app.inject({ method: "GET", url }); await app.close(); return r; };

describe("GET /api/libraries", () => {
  it("lists every library without host or port", async () => {
    const res = await get("/api/libraries");
    const body = res.json();
    expect(body).toHaveLength(Z3950_LIBRARIES.length);
    body.forEach((l: unknown) => SupportedLibrarySchema.parse(l));
    expect(res.body).not.toMatch(/host|port|database|catalog\.mbln/);
    expect(body.find((l: { id: string }) => l.id === "mbln").level).toBe("availability");
    expect(body.find((l: { id: string }) => l.id === "kcmo").level).toBe("availability");
  });
});

describe("GET /api/libraries/:id/availability", () => {
  it.each(["", "isbn=123", "isbn=9780141439518;ls", "isbn=97801414395", "isbn=9780141439518&isbn=9780141439518"])("400 for %s without searching", async (qs) => {
    svc.mockClear();
    expect((await get(`/api/libraries/mbln/availability?${qs}`)).statusCode).toBe(400);
    expect(svc).not.toHaveBeenCalled();
  });

  it("404 for an unknown library", async () => {
    svc.mockResolvedValue(null);
    expect((await get("/api/libraries/nope/availability?isbn=9780141439518")).statusCode).toBe(404);
  });

  it("503 when the catalog is unavailable", async () => {
    svc.mockRejectedValue(new Z3950UnavailableError("x"));
    const res = await get("/api/libraries/mbln/availability?isbn=9780141439518");
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: "This library's catalog is temporarily unavailable." });
  });

  it("200 with a schema-valid body", async () => {
    svc.mockResolvedValue({ found: true, level: "availability", copies: [{ branch: "Main", callNumber: null, status: "available", dueDate: null }] });
    const res = await get("/api/libraries/mbln/availability?isbn=9780141439518");
    expect(res.statusCode).toBe(200);
    LibraryAvailabilitySchema.parse(res.json());
  });

  it("is limited to 30 a minute", async () => {
    svc.mockResolvedValue({ found: false, level: "catalog", copies: [] });
    const app = await buildApp();
    const codes: number[] = [];
    for (let i = 0; i < 31; i++) codes.push((await app.inject({ method: "GET", url: "/api/libraries/mbln/availability?isbn=9780141439518" })).statusCode);
    await app.close();
    expect(codes.at(-1)).toBe(429);
    expect(codes.filter((c) => c === 200)).toHaveLength(30);
  });
});
