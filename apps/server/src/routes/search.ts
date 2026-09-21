import type { FastifyInstance } from "fastify";
import { searchBooks } from "../services/searchService.js";

export async function searchRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { q?: string } }>("/api/search", async (req, reply) => {
    const q = req.query.q;
    if (!q || !q.trim()) {
      reply.code(400);
      return { error: "Missing required query parameter 'q'" };
    }

    return searchBooks(q);
  });
}
