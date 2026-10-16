import type { FastifyInstance } from "fastify";
import { getBookDetail } from "../services/bookService.js";
import { isValidIsbn } from "../validation.js";

export async function booksRoutes(app: FastifyInstance) {
  app.get<{ Params: { isbn: string } }>("/api/books/isbn/:isbn", async (req, reply) => {
    const { isbn } = req.params;
    if (!isValidIsbn(isbn)) {
      reply.code(400);
      return { error: `"${isbn}" is not a valid ISBN-10 or ISBN-13` };
    }
    const book = await getBookDetail(isbn);

    if (!book) {
      reply.code(404);
      return { error: `No book found for ISBN ${isbn}` };
    }

    return book;
  });
}
