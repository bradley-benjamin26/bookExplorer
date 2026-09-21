import type { Work } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import * as openLibrary from "../sources/openLibrary.js";
import * as wikidata from "../sources/wikidata.js";
import { mergeLabelLists } from "../sources/loc.js";
import { startCommonEnrichment, blendHardcoverAndOpenLibraryRating, findWorkQid } from "./bookEnrichment.js";

const workCache = new TtlCache<Work | null>(1000 * 60 * 60);

/** Shared by the /api/works and /api/graph/work routes so both hit the same cache. */
export function getWorkDetail(workId: string): Promise<Work | null> {
  return workCache.wrap(workId, async () => {
    const olResult = await openLibrary.getWork(workId);
    if (!olResult) return null;
    const { isbnCandidates, ...ol } = olResult;

    // Same shared LOC/Hardcover/Open-Library-ratings pipeline a scanned book
    // uses (see bookEnrichment.ts), but tried across every edition ISBN
    // found (not just one) — a "work" is edition-agnostic in this app's own
    // model already, so any one LOC- or Hardcover-catalogued edition's data
    // is as usable as another's. No Google Books fallback here: this
    // service never otherwise touches Google Books, and a cover/rating
    // alone isn't worth adding a new call against its shared quota for.
    const { locMetadataPromise, hardcoverPromise, olRatingsPromise } = startCommonEnrichment(isbnCandidates, workId);

    // Same best-effort Wikidata work match as a scanned book, used here only
    // for its genre (P136) — a "work" page doesn't otherwise touch Wikidata
    // at all, so this is the one extra lookup that unlocks genre coverage
    // for nonfiction works, which LOC's fiction-focused GSAFD terms miss.
    const firstAuthorName = ol.authors[0]?.name ?? null;
    const workQid = await findWorkQid(ol.title, firstAuthorName);
    const wikidataGenres = workQid ? await wikidata.fetchGenres(workQid).catch(() => [] as string[]) : [];

    const [locMetadata, hc, olRatings] = await Promise.all([locMetadataPromise, hardcoverPromise, olRatingsPromise]);

    const result: Work = {
      openLibraryWorkId: workId,
      ...ol,
      // Same Open-Library-then-Hardcover cover fallback as a scanned book —
      // no Google Books here (see above), so a work whose edition Open
      // Library has no cover recorded for just has none instead of falling
      // any further.
      coverUrl: ol.coverUrl ?? hc?.coverUrl ?? null,
      subjects: mergeLabelLists(locMetadata.subjects, ol.subjects),
      genres: mergeLabelLists(locMetadata.genres, wikidataGenres),
      rating: blendHardcoverAndOpenLibraryRating(hc, olRatings),
      reviews: hc?.reviews ?? [],
    };
    return result;
  });
}
