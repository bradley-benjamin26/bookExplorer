import type { Work } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import * as openLibrary from "../sources/openLibrary.js";
import * as hardcover from "../sources/hardcover.js";
import * as wikidata from "../sources/wikidata.js";
import { fetchMetadataByAnyIsbn, mergeLabelLists } from "../sources/loc.js";
import { combineRatings } from "../ratings.js";

const workCache = new TtlCache<Work | null>(1000 * 60 * 60);

/** Shared by the /api/works and /api/graph/work routes so both hit the same cache. */
export function getWorkDetail(workId: string): Promise<Work | null> {
  return workCache.wrap(workId, async () => {
    const olResult = await openLibrary.getWork(workId);
    if (!olResult) return null;
    const { isbnCandidates, ...ol } = olResult;

    // Same LOC subject-heading and genre enrichment as a scanned book, but
    // tried across every edition ISBN found (not just the first) — a "work"
    // is edition-agnostic in this app's own model already, so any one
    // LOC-catalogued edition's data is as usable as another's.
    const locMetadataPromise = fetchMetadataByAnyIsbn(isbnCandidates);

    // Same Open Library ratings lookup as a scanned book — no Google Books
    // fallback here, since this service never otherwise touches Google
    // Books and ratings alone aren't worth adding a new call against its
    // shared quota for.
    const ratingsPromise = openLibrary.getRatings(workId).catch((err) => {
      console.warn(`[openLibrary] Failed to fetch ratings for work ${workId}:`, err);
      return null;
    });

    // Same Hardcover lookup as a scanned book, but a work has no ISBN of its
    // own — every edition ISBN found is tried in turn until one resolves.
    const hardcoverPromise = hardcover.lookupByAnyIsbn(isbnCandidates);

    // Same best-effort Wikidata work match as a scanned book, used here only
    // for its genre (P136) — a "work" page doesn't otherwise touch Wikidata
    // at all, so this is the one extra lookup that unlocks genre coverage
    // for nonfiction works, which LOC's fiction-focused GSAFD terms miss.
    const firstAuthorName = ol.authors[0]?.name ?? null;
    const workQid = firstAuthorName
      ? await wikidata.searchWorkQid(ol.title, firstAuthorName).catch(() => null)
      : null;
    const wikidataGenres = workQid ? await wikidata.fetchGenres(workQid).catch(() => [] as string[]) : [];

    const [locMetadata, olRatings, hc] = await Promise.all([locMetadataPromise, ratingsPromise, hardcoverPromise]);

    // Same Hardcover + Open Library blend as a scanned book (see combineRatings).
    const rating = combineRatings(
      hc?.rating && hc.ratingsCount ? { average: hc.rating, count: hc.ratingsCount, source: "hardcover" } : null,
      olRatings ? { ...olRatings, source: "openLibrary" } : null
    );

    const result: Work = {
      openLibraryWorkId: workId,
      ...ol,
      // Same Open-Library-then-Hardcover cover fallback as a scanned book —
      // no Google Books here (see hardcoverPromise above), so a work whose
      // edition Open Library has no cover recorded for just has none instead
      // of falling any further.
      coverUrl: ol.coverUrl ?? hc?.coverUrl ?? null,
      subjects: mergeLabelLists(locMetadata.subjects, ol.subjects),
      genres: mergeLabelLists(locMetadata.genres, wikidataGenres),
      rating,
      reviews: hc?.reviews ?? [],
    };
    return result;
  });
}
