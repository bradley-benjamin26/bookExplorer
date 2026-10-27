import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { getSubjectDetail } from "../services/subjectService.js";
import { subjectsRoutes } from "./subjects.js";

vi.mock("../services/subjectService.js", () => ({ getSubjectDetail: vi.fn() }));

describe("GET /api/subjects/:slug", () => {
  it("returns 400 for a non-slug without calling the service", async () => {
    const app = Fastify();
    await app.register(subjectsRoutes);
    const res = await app.inject({ method: "GET", url: "/api/subjects/%2C%20--" });
    await app.close();
    expect(res.statusCode).toBe(400);
    expect(getSubjectDetail).not.toHaveBeenCalled();
  });

  it("serves a legacy '--' slug, answering with the canonical slug", async () => {
    vi.mocked(getSubjectDetail).mockImplementationOnce(async () => ({
      slug: "science_fiction_authorship", name: "Science fiction authorship", workCount: 141, wikidataId: null,
      description: null, relatedConcepts: [], books: [],
    }));
    const app = Fastify();
    await app.register(subjectsRoutes);
    const res = await app.inject({ method: "GET", url: "/api/subjects/science_fiction_--_authorship" });
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(res.json().slug).toBe("science_fiction_authorship");
  });
});
