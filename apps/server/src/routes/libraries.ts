import type { FastifyInstance } from "fastify";
import { isValidIsbn, normalizeIsbn, type SupportedLibrary } from "@book-explorer/shared";
import { UpstreamUnavailableError } from "../httpClient.js";
import { getLibraryAvailability } from "../services/libraryAvailability.js";
import { ALMA_LIBRARIES } from "../sources/almaSru.js";
import { Z3950UnavailableError } from "../z3950/client.js";
import { Z3950_LIBRARIES } from "../z3950/registry.js";

const AVAILABILITY_RATE_LIMIT = { max: 30, timeWindow: "1 minute" };

export async function librariesRoutes(app: FastifyInstance) {
  app.get("/api/libraries", async (): Promise<SupportedLibrary[]> => [
    ...Z3950_LIBRARIES.map((l): SupportedLibrary => ({ id: l.id, name: l.name, level: l.holdings !== "none" ? "availability" : "catalog" })),
    ...ALMA_LIBRARIES.map((l): SupportedLibrary => ({ id: l.id, name: l.name, level: "availability" })),
  ]);

  app.get<{ Params: { id: string }; Querystring: Record<string, unknown> }>(
    "/api/libraries/:id/availability",
    { config: { rateLimit: AVAILABILITY_RATE_LIMIT } },
    async (req, reply) => {
      const { isbn } = req.query;
      // Same check as searchByIsbn: normalizeIsbn silently drops junk, so reject it first.
      if (typeof isbn !== "string" || !/^[0-9Xx\- ]+$/.test(isbn) || !isValidIsbn(isbn)) {
        reply.code(400);
        return { error: "'isbn' must be a valid ISBN" };
      }
      const disconnected = new AbortController();
      reply.raw.on("close", () => {
        if (!reply.raw.writableEnded) disconnected.abort();
      });
      try {
        const result = await getLibraryAvailability(req.params.id, normalizeIsbn(isbn), disconnected.signal);
        if (!result) {
          reply.code(404);
          return { error: "Unknown library" };
        }
        return result;
      } catch (err) {
        if (!(err instanceof Z3950UnavailableError || err instanceof UpstreamUnavailableError)) throw err;
        reply.code(503);
        return { error: "This library's catalog is temporarily unavailable." };
      }
    }
  );
}
