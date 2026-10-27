import { slugifySubject } from "@book-explorer/shared";
import type { FastifyInstance } from "fastify";
import { getSubjectDetail } from "../services/subjectService.js";
import { isSubjectSlug } from "../validation.js";

export async function subjectsRoutes(app: FastifyInstance) {
  app.get<{ Params: { slug: string } }>("/api/subjects/:slug", async (req, reply) => {
    const { slug } = req.params;
    // A legacy slug (e.g. from an old shared link) is fine; the service answers with the canonical one.
    if (!isSubjectSlug(slugifySubject(slug))) {
      reply.code(400);
      return { error: `"${slug}" is not a valid subject slug` };
    }

    const subject = await getSubjectDetail(slug);

    if (!subject) {
      reply.code(404);
      return { error: `No subject found for ${slug}` };
    }

    return subject;
  });
}
