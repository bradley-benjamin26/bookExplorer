import type { FastifyInstance } from "fastify";
import { getAuthorDetail } from "../services/authorService.js";

export async function authorsRoutes(app: FastifyInstance) {
  app.get<{ Params: { openLibraryId: string } }>("/api/authors/:openLibraryId", async (req, reply) => {
    const { openLibraryId } = req.params;
    const author = await getAuthorDetail(openLibraryId);

    if (!author) {
      reply.code(404);
      return { error: `No author found for id ${openLibraryId}` };
    }

    return author;
  });
}
