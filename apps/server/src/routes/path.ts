import type { FastifyInstance } from "fastify";
import { findPath, graphNeighbours } from "../services/graphQuery.js";
import { isPathEndpointId } from "../validation.js";

// One path search can fan out to dozens of graph expansions upstream, so it
// gets a much smaller allowance than the global 100/minute.
const PATH_RATE_LIMIT = { max: 10, timeWindow: "1 minute" };

export async function pathRoutes(app: FastifyInstance) {
  app.get<{ Querystring: Record<string, unknown> }>(
    "/api/path",
    { config: { rateLimit: PATH_RATE_LIMIT } },
    async (req, reply) => {
      const { from, to } = req.query;
      for (const [key, value] of [["from", from], ["to", to]] as const) {
        if (typeof value !== "string" || !isPathEndpointId(value)) {
          reply.code(400);
          return { error: `'${key}' must be one author:, work: or subject: node id` };
        }
      }
      if (from === to) {
        reply.code(400);
        return { error: "'from' and 'to' must differ" };
      }
      // A client that leaves before the answer stops the search starting more upstream work.
      const disconnected = new AbortController();
      reply.raw.on("close", () => {
        if (!reply.raw.writableEnded) disconnected.abort();
      });
      return findPath(from as string, to as string, graphNeighbours, undefined, disconnected.signal);
    }
  );
}
