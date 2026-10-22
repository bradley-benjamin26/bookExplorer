import type { FastifyInstance } from "fastify";
import { searchBooks } from "../services/searchService.js";
import { parseSearchFilters } from "../validation.js";

export async function searchRoutes(app: FastifyInstance) {
  app.get<{ Querystring: Record<string, unknown> }>("/api/search", async (req, reply) => {
    const { q } = req.query;
    const filters = parseSearchFilters(req.query);
    if (typeof filters === "string") {
      reply.code(400);
      return { error: filters };
    }
    // A query is q, or an author/subject filter on its own (the app's Author
    // and Subject modes).
    if (q !== undefined && typeof q !== "string") {
      reply.code(400);
      return { error: "'q' must be a single value" };
    }
    if (!q?.trim() && !filters.author && !filters.subject) {
      reply.code(400);
      return { error: "Missing required query parameter 'q'" };
    }

    return searchBooks(q ?? "", filters);
  });
}
