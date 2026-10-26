import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { getSubjectDetail } from "../services/subjectService.js";
import { subjectsRoutes } from "./subjects.js";

vi.mock("../services/subjectService.js", () => ({ getSubjectDetail: vi.fn() }));

describe("GET /api/subjects/:slug", () => {
  it("returns 400 for a non-slug without calling the service", async () => {
    const app = Fastify();
    await app.register(subjectsRoutes);
    const res = await app.inject({ method: "GET", url: "/api/subjects/Science%20Fiction" });
    await app.close();
    expect(res.statusCode).toBe(400);
    expect(getSubjectDetail).not.toHaveBeenCalled();
  });
});
