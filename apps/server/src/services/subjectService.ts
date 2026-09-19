import type { Subject } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import * as openLibrary from "../sources/openLibrary.js";
import * as wikidata from "../sources/wikidata.js";

const subjectCache = new TtlCache<Subject | null>(1000 * 60 * 60 * 24);

/** Shared by the /api/subjects and /api/graph/subject routes so both hit the same cache. */
export function getSubjectDetail(slug: string): Promise<Subject | null> {
  return subjectCache.wrap(slug, async () => {
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
}
