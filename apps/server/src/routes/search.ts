import type { FastifyInstance } from "fastify";
import { searchBooks } from "../services/searchService.js";
import { parseSearchFilters } from "../validation.js";

export async function searchRoutes(app: FastifyInstance) {
  app.get<{ Querystring: Record<string, string | undefined> }>("/api/search", async (req, reply) => {
    const { q } = req.query;
    const filters = parseSearchFilters(req.query);
    if (typeof filters === "string") {
      reply.code(400);
      return { error: filters };
    }
    // A query is q, or an author/subject filter on its own (the app's Author
    // and Subject modes).
    if (!q?.trim() && !filters.author && !filters.subject) {
      reply.code(400);
      return { error: "Missing required query parameter 'q'" };
    }

    return searchBooks(q ?? "", filters);
  });
}
