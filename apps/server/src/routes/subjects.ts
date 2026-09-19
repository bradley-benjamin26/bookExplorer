import type { FastifyInstance } from "fastify";
import type { Subject } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import * as openLibrary from "../sources/openLibrary.js";
import * as wikidata from "../sources/wikidata.js";

const subjectCache = new TtlCache<Subject | null>(1000 * 60 * 60 * 24);

export async function subjectsRoutes(app: FastifyInstance) {
  app.get<{ Params: { slug: string } }>("/api/subjects/:slug", async (req, reply) => {
    const { slug } = req.params;

    const subject = await subjectCache.wrap(slug, async () => {
      const ol = await openLibrary.getSubject(slug);
      if (!ol) return null;

      const qid = await wikidata.searchConceptQid(ol.name).catch(() => null);
      const relatedConcepts = qid ? await wikidata.fetchRelatedConcepts(qid).catch(() => []) : [];

      const result: Subject = {
        slug,
        name: ol.name,
        workCount: ol.workCount,
        wikidataId: qid,
        relatedConcepts,
        books: ol.works.map((w) => ({
          openLibraryWorkId: w.workId,
          title: w.title,
          authors: w.authors,
          coverUrl: w.coverUrl,
        })),
      };
      return result;
    });

    if (!subject) {
      reply.code(404);
      return { error: `No subject found for ${slug}` };
    }

    return subject;
  });
}
