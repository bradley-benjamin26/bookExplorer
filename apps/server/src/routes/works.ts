import type { FastifyInstance } from "fastify";
import type { Work } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import * as openLibrary from "../sources/openLibrary.js";

const workCache = new TtlCache<Work | null>(1000 * 60 * 60);

export async function worksRoutes(app: FastifyInstance) {
  app.get<{ Params: { workId: string } }>("/api/works/:workId", async (req, reply) => {
    const { workId } = req.params;

    const work = await workCache.wrap(workId, async () => {
      const ol = await openLibrary.getWork(workId);
      if (!ol) return null;
      const result: Work = { openLibraryWorkId: workId, ...ol };
      return result;
    });

    if (!work) {
      reply.code(404);
      return { error: `No work found for id ${workId}` };
    }

    return work;
  });
}
