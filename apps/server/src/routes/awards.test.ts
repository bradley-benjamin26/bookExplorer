import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { getAwardDetail } from "../services/awardService.js";
import { awardsRoutes } from "./awards.js";

vi.mock("../services/awardService.js", () => ({ getAwardDetail: vi.fn() }));

describe("GET /api/awards/:slug", () => {
  it("returns the award", async () => {
    const award = { slug: "hugo_award", name: "Hugo Award", wikidataId: "Q1", description: null, winners: [] };
    vi.mocked(getAwardDetail).mockResolvedValueOnce(award);
    const app = Fastify();
    await app.register(awardsRoutes);
    const res = await app.inject({ method: "GET", url: "/api/awards/hugo_award?label=Hugo%20Award" });
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(award);
    expect(getAwardDetail).toHaveBeenCalledWith("hugo_award", "Hugo Award");
  });

  it("returns 400 for a slug over 100 characters", async () => {
    vi.mocked(getAwardDetail).mockClear();
    const app = Fastify({ maxParamLength: 500 });
    await app.register(awardsRoutes);
    const res = await app.inject({ method: "GET", url: `/api/awards/${"a".repeat(101)}` });
    await app.close();
    expect(res.statusCode).toBe(400);
    expect(getAwardDetail).not.toHaveBeenCalled();
  });
});
