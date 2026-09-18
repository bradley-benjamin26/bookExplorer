import type { FastifyInstance } from "fastify";
import type { Author } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import * as openLibrary from "../sources/openLibrary.js";
import * as wikidata from "../sources/wikidata.js";

// Wikidata data changes rarely and its SPARQL endpoint is rate-limited, so
// author lookups are cached longer than book lookups.
const authorCache = new TtlCache<Author | null>(1000 * 60 * 60 * 24);

export async function authorsRoutes(app: FastifyInstance) {
  app.get<{ Params: { openLibraryId: string } }>("/api/authors/:openLibraryId", async (req, reply) => {
    const { openLibraryId } = req.params;

    const author = await authorCache.wrap(openLibraryId, async () => {
      const ol = await openLibrary.getAuthor(openLibraryId);
      if (!ol) return null;

      const qid = ol.wikidataId ?? (await wikidata.searchAuthorQid(ol.name).catch(() => null));
      const relations = qid ? await wikidata.fetchAuthorRelations(qid).catch(() => []) : [];

      const result: Author = {
        openLibraryId,
        name: ol.name,
        wikidataId: qid,
        bio: ol.bio,
        birthDate: ol.birthDate,
        deathDate: ol.deathDate,
        relations,
      };
      return result;
    });

    if (!author) {
      reply.code(404);
      return { error: `No author found for id ${openLibraryId}` };
    }

    return author;
  });
}
