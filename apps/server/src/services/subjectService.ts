import type { Subject } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import * as openLibrary from "../sources/openLibrary.js";
import * as wikidata from "../sources/wikidata.js";

const subjectCache = new TtlCache<Subject | null>(1000 * 60 * 60 * 24);

/**
 * Shared by the /api/subjects and /api/graph/subject routes so both hit the
 * same cache. See the comment on getAuthorDetail in authorService.ts for why
 * a failed Wikidata lookup is allowed to throw here rather than being
 * swallowed into a falsely-cached "no related concepts."
 */
export function getSubjectDetail(slug: string): Promise<Subject | null> {
  return subjectCache.wrap(slug, async () => {
    const ol = await openLibrary.getSubject(slug);
    if (!ol) return null;

    const qid = await wikidata.searchConceptQid(ol.name);
    const relatedConcepts = qid ? await wikidata.fetchRelatedConcepts(qid) : [];

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
