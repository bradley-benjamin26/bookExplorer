import type { FastifyInstance } from "fastify";
import { TtlCache } from "../cache.js";
import { searchAuthors } from "../sources/openLibrary.js";
import { searchBooks } from "../services/searchService.js";
import { parseSearchFilters } from "../validation.js";

// Memory only (no namespace): a typed query is free text, like the book search cache.
const authorSearchCache = new TtlCache<{ openLibraryId: string; name: string }[]>(1000 * 60 * 10, 1000);
const MIN_AUTHOR_QUERY_LENGTH = 3;

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

  app.get<{ Querystring: { q?: unknown } }>("/api/search/authors", async (req, reply) => {
    const q = req.query.q;
    if (typeof q !== "string" || q.length > 100) {
      reply.code(400);
      return { error: "'q' must be a single value of at most 100 characters" };
    }
    const name = q.trim();
    if (name.length < MIN_AUTHOR_QUERY_LENGTH) return [];
    return authorSearchCache.wrap(name.toLowerCase(), () => searchAuthors(name, 5));
  });
}
