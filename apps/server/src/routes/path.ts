import { slugifySubject } from "@book-explorer/shared";
import type { FastifyInstance } from "fastify";
import { findPath, graphNeighbours } from "../services/graphQuery.js";
import { isPathEndpointId } from "../validation.js";

// One path search can fan out to dozens of graph expansions upstream, so it
// gets a much smaller allowance than the global 100/minute.
const PATH_RATE_LIMIT = { max: 10, timeWindow: "1 minute" };

/** A legacy or unslugified subject/genre id as the graph names that node, so the search can meet it. */
function canonicalNodeId(nodeId: string): string {
  const m = /^(subject|genre):(.*)$/s.exec(nodeId);
  return m ? `${m[1]}:${slugifySubject(m[2])}` : nodeId;
}

export async function pathRoutes(app: FastifyInstance) {
  app.get<{ Querystring: Record<string, unknown> }>(
    "/api/path",
    { config: { rateLimit: PATH_RATE_LIMIT } },
    async (req, reply) => {
      const { from: rawFrom, to: rawTo } = req.query;
      for (const [key, value] of [["from", rawFrom], ["to", rawTo]] as const) {
        if (typeof value !== "string" || !isPathEndpointId(value)) {
          reply.code(400);
          return { error: `'${key}' must be one author:, work:, subject: or genre: node id` };
        }
      }
      const from = canonicalNodeId(rawFrom as string);
      const to = canonicalNodeId(rawTo as string);
      if (from === to) {
        reply.code(400);
        return { error: "'from' and 'to' must differ" };
      }
      // A client that leaves before the answer stops the search starting more upstream work.
      const disconnected = new AbortController();
      reply.raw.on("close", () => {
        if (!reply.raw.writableEnded) disconnected.abort();
      });
      return findPath(from, to, graphNeighbours, undefined, disconnected.signal);
    }
  );
}
