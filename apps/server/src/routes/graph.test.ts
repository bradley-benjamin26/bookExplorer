import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { buildSubjectGraph } from "../services/graphService.js";
import { graphRoutes } from "./graph.js";

vi.mock("../services/graphService.js", () => ({ buildAuthorGraph: vi.fn(), buildSubjectGraph: vi.fn(), buildWorkGraph: vi.fn() }));

describe("GET /api/graph/subject/:id", () => {
  it("returns 400 for a non-slug without building a graph", async () => {
    const app = Fastify();
    await app.register(graphRoutes);
    const res = await app.inject({ method: "GET", url: "/api/graph/subject/%2C%20--" });
    await app.close();
    expect(res.statusCode).toBe(400);
    expect(buildSubjectGraph).not.toHaveBeenCalled();
  });
});
