import type { FastifyInstance } from "fastify";
import { getAuthorDetail } from "../services/authorService.js";
import { isOpenLibraryAuthorId } from "../validation.js";

export async function authorsRoutes(app: FastifyInstance) {
  app.get<{ Params: { openLibraryId: string } }>("/api/authors/:openLibraryId", async (req, reply) => {
    const { openLibraryId } = req.params;
    if (!isOpenLibraryAuthorId(openLibraryId)) {
      reply.code(400);
      return { error: `"${openLibraryId}" is not an Open Library author id` };
    }
    const author = await getAuthorDetail(openLibraryId);

    if (!author) {
      reply.code(404);
      return { error: `No author found for id ${openLibraryId}` };
    }

    return author;
  });
}
