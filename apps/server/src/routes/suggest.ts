import type { FastifyInstance } from "fastify";
import { suggestHeadings } from "../sources/locLinkedData.js";

const VOCABS = { subjects: "subjects", genres: "genreForms" } as const;

export async function suggestRoutes(app: FastifyInstance) {
  app.get<{ Params: { vocab: string }; Querystring: { q?: unknown } }>("/api/suggest/:vocab", async (req, reply) => {
    const vocab = Object.hasOwn(VOCABS, req.params.vocab) ? VOCABS[req.params.vocab as keyof typeof VOCABS] : undefined;
    const q = req.query.q;
    if (!vocab || typeof q !== "string" || q.trim().length < 2 || q.length > 100) {
      reply.code(400);
      return { error: "Use subjects or genres, with 'q' of 2 to 100 characters" };
    }
    return suggestHeadings(vocab, q.trim());
  });
}
