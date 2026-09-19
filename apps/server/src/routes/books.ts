import type { FastifyInstance } from "fastify";
import { getBookDetail } from "../services/bookService.js";

export async function booksRoutes(app: FastifyInstance) {
  app.get<{ Params: { isbn: string } }>("/api/books/isbn/:isbn", async (req, reply) => {
    const { isbn } = req.params;
    const book = await getBookDetail(isbn);

    if (!book) {
      reply.code(404);
      return { error: `No book found for ISBN ${isbn}` };
    }

    return book;
  });
}
