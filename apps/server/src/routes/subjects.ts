import type { FastifyInstance } from "fastify";
import { getSubjectDetail } from "../services/subjectService.js";

export async function subjectsRoutes(app: FastifyInstance) {
  app.get<{ Params: { slug: string } }>("/api/subjects/:slug", async (req, reply) => {
    const { slug } = req.params;
    const subject = await getSubjectDetail(slug);

    if (!subject) {
      reply.code(404);
      return { error: `No subject found for ${slug}` };
    }

    return subject;
  });
}
