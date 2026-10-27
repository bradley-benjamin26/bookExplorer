import { slugifySubject, type Subject, type SubjectConcept } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import * as locLinkedData from "../sources/locLinkedData.js";
import * as openLibrary from "../sources/openLibrary.js";
import * as wikidata from "../sources/wikidata.js";
import { optionalSource } from "./bookEnrichment.js";

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
 * Open Library's subject for a slug, tried in its canonical form first. Only
 * if that has no works is a different raw slug tried: a legacy "--" slug from
 * an old link, for the rare heading Open Library files only that way.
 */
async function loadOlSubject(slug: string): Promise<openLibrary.OpenLibrarySubject | null> {
  const canonical = slugifySubject(slug);
  const ol = await openLibrary.getSubject(canonical);
  if ((ol && ol.workCount > 0) || canonical === slug) return ol;
  return (await openLibrary.getSubject(slug)) ?? ol;
}

/**
 * Shared by the /api/subjects and /api/graph/subject routes so both hit the
 * same cache. LCSH and Wikidata are optional: a failed lookup is served
 * without them and cached only briefly (see optionalSource), so an outage
 * neither fails the page nor is remembered for a day as "no related concepts".
 */
export function getSubjectDetail(slug: string): Promise<Subject | null> {
  return subjectCache.wrap(slug, async (entry) => {
    const ol = await loadOlSubject(slug);
    if (!ol) return null;

    // Matching by name alone confuses same-spelled things ("ghosts" the
    // supernatural vs. a TV series), so the Wikidata item LCSH itself links
    // its heading to is trusted first; only a heading with no such link (or
    // no heading at all) falls back to a — stricter — Wikidata name search.
    const lcshUri = await locLinkedData
      .findSubjectHeadingUri(ol.name)
      .catch(optionalSource<string | null>(entry, "loc subject heading", null));
    const lcshConcepts = lcshUri
      ? await locLinkedData.fetchBroaderNarrower(lcshUri).catch(optionalSource(entry, "loc broader/narrower", locLinkedData.EMPTY))
      : locLinkedData.EMPTY;
    const qid =
      lcshConcepts.wikidataId ??
      (await wikidata.searchConceptQid(ol.name).catch(optionalSource<string | null>(entry, "wikidata concept search", null)));
    const [wikidataConcepts, description] = await Promise.all([
      qid ? wikidata.fetchRelatedConcepts(qid).catch(optionalSource<SubjectConcept[]>(entry, "wikidata related concepts", [])) : [],
      qid ? wikidata.fetchDescription(qid).catch(optionalSource<string | null>(entry, "wikidata description", null)) : null,
    ]);
    return toSubject(slugifySubject(slug), ol, qid, description, mergeSubjectConcepts(wikidataConcepts, lcshConcepts));
  });
}

/**
 * The path finder's cheap subject: Open Library's book list and work count
 * only. The LCSH/Wikidata concept lookups above took up to ~10 s a subject
 * on a cold cache, which no path search could afford.
 */
export function getSubjectBooks(slug: string): Promise<Subject | null> {
  return subjectBooksCache.wrap(slug, async () => {
    const ol = await loadOlSubject(slug);
    return ol && toSubject(slugifySubject(slug), ol, null, null, []);
  });
}
