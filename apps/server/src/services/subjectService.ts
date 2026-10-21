import type { Subject, SubjectConcept } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import * as locLinkedData from "../sources/locLinkedData.js";
import * as openLibrary from "../sources/openLibrary.js";
import * as wikidata from "../sources/wikidata.js";

const subjectCache = new TtlCache<Subject | null>(1000 * 60 * 60 * 24);

/**
 * Merges Wikidata's own broader/narrower concepts with LCSH's broader/narrower
 * labels into one source-tagged, deduped list — same first-seen-spelling-wins
 * dedup rule as loc.ts's mergeTaggedTerms, but concept-specific: grouped by
 * relation and carrying each concept's wikidataId (null for an LCSH-only entry).
 */
function mergeSubjectConcepts(
  wikidataConcepts: SubjectConcept[],
  lcsh: { broader: string[]; narrower: string[] }
): SubjectConcept[] {
  const merged = new Map<string, SubjectConcept>();

  for (const concept of wikidataConcepts) {
    const key = `${concept.relation}:${concept.label.trim().toLowerCase()}`;
    merged.set(key, { ...concept, sources: [...concept.sources] });
  }

  for (const relation of ["broader", "narrower"] as const) {
    for (const label of lcsh[relation]) {
      const key = `${relation}:${label.trim().toLowerCase()}`;
      const existing = merged.get(key);
      if (existing) {
        if (!existing.sources.includes("lcsh")) existing.sources.push("lcsh");
      } else {
        merged.set(key, { relation, label, sources: ["lcsh"], wikidataId: null });
      }
    }
  }

  return [...merged.values()];
}

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
    const [wikidataConcepts, lcshUri] = await Promise.all([
      qid ? wikidata.fetchRelatedConcepts(qid) : Promise.resolve([]),
      locLinkedData.findSubjectHeadingUri(ol.name).catch(() => null),
    ]);
    const lcshConcepts = lcshUri
      ? await locLinkedData.fetchBroaderNarrower(lcshUri).catch(() => ({ broader: [] as string[], narrower: [] as string[] }))
      : { broader: [] as string[], narrower: [] as string[] };
    const relatedConcepts = mergeSubjectConcepts(wikidataConcepts, lcshConcepts);

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
