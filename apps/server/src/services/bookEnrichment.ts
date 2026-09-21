import * as openLibrary from "../sources/openLibrary.js";
import * as hardcover from "../sources/hardcover.js";
import * as wikidata from "../sources/wikidata.js";
import { fetchMetadataByAnyIsbn } from "../sources/loc.js";
import { combineRatings } from "../ratings.js";
import type { HardcoverBookData } from "../sources/hardcover.js";
import type { OpenLibraryRatings } from "../sources/openLibrary.js";
import type { Rating } from "@book-explorer/shared";

/**
 * The enrichment pipeline a scanned book (one ISBN) and a work page
 * (edition-agnostic, tried across every edition ISBN found) both need in the
 * same shape: LOC's controlled subject/genre headings, a Hardcover lookup,
 * and Open Library's own ratings — three best-effort, mutually independent
 * lookups, so they're kicked off together and left to the caller to await
 * once it actually needs them (typically after its own book/work-specific
 * lookups, like the Wikidata work match below, have had a chance to run
 * too).
 */
export function startCommonEnrichment(isbnCandidates: string[], workId: string | null) {
  const locMetadataPromise = fetchMetadataByAnyIsbn(isbnCandidates);
  const hardcoverPromise = hardcover.lookupByAnyIsbn(isbnCandidates);
  const olRatingsPromise: Promise<OpenLibraryRatings | null> = workId
    ? openLibrary.getRatings(workId).catch((err) => {
        console.warn(`[openLibrary] Failed to fetch ratings for work ${workId}:`, err);
        return null;
      })
    : Promise.resolve(null);
  return { locMetadataPromise, hardcoverPromise, olRatingsPromise };
}

/**
 * Hardcover and Open Library blended into one count-weighted average (see
 * combineRatings) rather than picking just one. A caller with its own extra
 * last-resort source (bookService's Google Books rating) layers that on top
 * of this result rather than folding it in here.
 */
export function blendHardcoverAndOpenLibraryRating(
  hc: HardcoverBookData | null,
  olRatings: OpenLibraryRatings | null
): Rating | null {
  return combineRatings(
    hc?.rating && hc.ratingsCount ? { average: hc.rating, count: hc.ratingsCount, source: "hardcover" } : null,
    olRatings ? { ...olRatings, source: "openLibrary" } : null
  );
}

/**
 * Best-effort match of the work itself (not a specific edition or film
 * adaptation) to a Wikidata item, by title + first author name — used by a
 * scanned book to source its Wikipedia "about" text and by both a book and a
 * work page to source Wikidata's genre property (P136), which — unlike
 * LOC's fiction-focused GSAFD terms — covers nonfiction too. Failure here is
 * always caught: this is supplementary data on top of a lookup that's
 * already fully usable without it.
 */
export async function findWorkQid(title: string, firstAuthorName: string | null): Promise<string | null> {
  return firstAuthorName ? await wikidata.searchWorkQid(title, firstAuthorName).catch(() => null) : null;
}
