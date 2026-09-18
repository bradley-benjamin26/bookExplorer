import type { FastifyInstance } from "fastify";
import type { Book } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import * as openLibrary from "../sources/openLibrary.js";
import * as googleBooks from "../sources/googleBooks.js";

const bookCache = new TtlCache<Book | null>(1000 * 60 * 60);

export async function booksRoutes(app: FastifyInstance) {
  app.get<{ Params: { isbn: string } }>("/api/books/isbn/:isbn", async (req, reply) => {
    const { isbn } = req.params;

    const book = await bookCache.wrap(isbn, async () => {
      const ol = await openLibrary.lookupByIsbn(isbn);
      if (!ol) return null;

      let coverUrl = ol.coverUrl;
      let description = ol.description;

      if (!coverUrl || !description) {
        const gb = await googleBooks.lookupByIsbn(isbn).catch(() => null);
        coverUrl = coverUrl ?? gb?.coverUrl ?? null;
        description = description ?? gb?.description ?? null;
      }

      const result: Book = {
        isbn,
        title: ol.title,
        authors: ol.authors,
        subjects: ol.subjects,
        description,
        coverUrl,
        openLibraryWorkId: null,
      };
      return result;
    });

    if (!book) {
      reply.code(404);
      return { error: `No book found for ISBN ${isbn}` };
    }

    return book;
  });
}
