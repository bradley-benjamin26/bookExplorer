import type { Subject, SubjectConcept } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import * as locLinkedData from "../sources/locLinkedData.js";
import type { BroaderNarrower } from "../sources/locLinkedData.js";
import * as openLibrary from "../sources/openLibrary.js";
import * as wikidata from "../sources/wikidata.js";

const NO_LCSH: BroaderNarrower = { broader: [], narrower: [], wikidataId: null };

const subjectCache = new TtlCache<Subject | null>(1000 * 60 * 60 * 24, 1000, "subject");
const subjectBooksCache = new TtlCache<Subject | null>(1000 * 60 * 60 * 24, 1000, "subjectBooks");

function toSubject(
  slug: string,
  ol: openLibrary.OpenLibrarySubject,
  qid: string | null,
  description: string | null,
  relatedConcepts: SubjectConcept[]
): Subject {
  return {
    slug,
    name: ol.name,
    workCount: ol.workCount,
    wikidataId: qid,
    description,
    relatedConcepts,
    books: ol.works.map((w) => ({
      openLibraryWorkId: w.workId,
      title: w.title,
      authors: w.authors,
      coverUrl: w.coverUrl,
    })),
  };
}

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

    // Matching by name alone confuses same-spelled things ("ghosts" the
    // supernatural vs. a TV series), so the Wikidata item LCSH itself links
    // its heading to is trusted first; only a heading with no such link (or
    // no heading at all) falls back to a — stricter — Wikidata name search.
    const lcshUri = await locLinkedData.findSubjectHeadingUri(ol.name).catch(() => null);
    const lcshConcepts = lcshUri
      ? await locLinkedData.fetchBroaderNarrower(lcshUri).catch(() => NO_LCSH)
      : NO_LCSH;
    const qid = lcshConcepts.wikidataId ?? (await wikidata.searchConceptQid(ol.name));
    const [wikidataConcepts, description] = await Promise.all([
      qid ? wikidata.fetchRelatedConcepts(qid) : Promise.resolve([]),
      qid ? wikidata.fetchDescription(qid).catch(() => null) : Promise.resolve(null),
    ]);
    return toSubject(slug, ol, qid, description, mergeSubjectConcepts(wikidataConcepts, lcshConcepts));
  });
}

/**
 * The path finder's cheap subject: Open Library's book list and work count
 * only. The LCSH/Wikidata concept lookups above took up to ~10 s a subject
 * on a cold cache, which no path search could afford.
 */
export function getSubjectBooks(slug: string): Promise<Subject | null> {
  return subjectBooksCache.wrap(slug, async () => {
    const ol = await openLibrary.getSubject(slug);
    return ol && toSubject(slug, ol, null, null, []);
  });
}
