import type { FastifyInstance } from "fastify";
import { getAwardDetail } from "../services/awardService.js";

export async function awardsRoutes(app: FastifyInstance) {
  app.get<{ Params: { slug: string }; Querystring: { label?: string } }>("/api/awards/:slug", async (req, reply) => {
    const { slug } = req.params;
    const { label } = req.query;
    if (!slug || slug.length > 100 || (label !== undefined && (typeof label !== "string" || label.length > 200))) {
      reply.code(400);
      return { error: "Invalid award" };
    }
    return getAwardDetail(slug, label);
  });
}
