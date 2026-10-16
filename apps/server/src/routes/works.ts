import type { FastifyInstance } from "fastify";
import { getWorkDetail } from "../services/workService.js";
import { isOpenLibraryWorkId } from "../validation.js";

export async function worksRoutes(app: FastifyInstance) {
  app.get<{ Params: { workId: string } }>("/api/works/:workId", async (req, reply) => {
    const { workId } = req.params;
    if (!isOpenLibraryWorkId(workId)) {
      reply.code(400);
      return { error: `"${workId}" is not an Open Library work id` };
    }
    const work = await getWorkDetail(workId);

    if (!work) {
      reply.code(404);
      return { error: `No work found for id ${workId}` };
    }

    return work;
  });
}
