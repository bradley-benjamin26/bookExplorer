import * as openLibrary from "../sources/openLibrary.js";
import * as hardcover from "../sources/hardcover.js";
import * as wikidata from "../sources/wikidata.js";
import { EMPTY_METADATA, fetchMetadataByAnyIsbn } from "../sources/loc.js";
import { UpstreamUnavailableError } from "../httpClient.js";
import { combineRatings } from "../ratings.js";
import type { HardcoverBookData } from "../sources/hardcover.js";
import type { OpenLibraryRatings } from "../sources/openLibrary.js";
import type { AuthorRef, Rating, WorkRef } from "@book-explorer/shared";
import type { CacheEntryOptions } from "../cache.js";

// How long a book/work assembled while one of its optional sources was
// failing stays cached — long enough to absorb a burst of repeat views, short
// enough that a brief outage isn't remembered as "this book has no
// ratings/reviews/genres" for the cache's full hour.
export const DEGRADED_TTL_MS = 1000 * 60 * 5;

/**
 * A `.catch` handler for an optional source: logs the failure, falls back to
 * `fallback` so the rest of the response is still served, and shortens this
 * cache entry's TTL (see DEGRADED_TTL_MS) so the gap is retried soon instead
 * of being cached as if the source genuinely had nothing.
 */
export function optionalSource<T>(entry: CacheEntryOptions, sourceName: string, fallback: T) {
  return (err: unknown): T => {
    // A cooldown was already logged once by httpClient; not once per request.
    if (!(err instanceof UpstreamUnavailableError)) console.warn(`[${sourceName}] Optional lookup failed:`, err);
    entry.ttlMs = Math.min(entry.ttlMs, DEGRADED_TTL_MS);
    return fallback;
  };
}

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
export function startCommonEnrichment(isbnCandidates: string[], workId: string | null, entry: CacheEntryOptions) {
  const locMetadataPromise = fetchMetadataByAnyIsbn(isbnCandidates).catch(
    optionalSource(entry, "loc", EMPTY_METADATA)
  );
  const hardcoverPromise = hardcover
    .lookupByAnyIsbn(isbnCandidates)
    .catch(optionalSource<HardcoverBookData | null>(entry, "hardcover", null));
  const olRatingsPromise: Promise<OpenLibraryRatings | null> = workId
    ? openLibrary.getRatings(workId).catch(optionalSource<OpenLibraryRatings | null>(entry, "openLibrary ratings", null))
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
 * always caught (shortening the cache entry's TTL): this is supplementary
 * data on top of a lookup that's already fully usable without it.
 */
export async function findWorkQid(
  title: string,
  firstAuthorName: string | null,
  entry: CacheEntryOptions
): Promise<string | null> {
  if (!firstAuthorName) return null;
  return wikidata.searchWorkQid(title, firstAuthorName).catch(optionalSource<string | null>(entry, "wikidata work search", null));
}

const MORE_BY_AUTHOR_CAP = 8;

/**
 * Other works by the same author from Open Library, excluding `excludeWorkId`
 * (the work being viewed, if any). Optional enrichment: failure yields
 * undefined (field omitted) and shortens the cache entry's TTL.
 */
export async function fetchMoreByAuthor(
  author: AuthorRef | undefined,
  excludeWorkId: string | null,
  entry: CacheEntryOptions
): Promise<WorkRef[] | undefined> {
  if (!author) return undefined;
  const works = await openLibrary
    .getAuthorWorks(author.openLibraryId, MORE_BY_AUTHOR_CAP + 1)
    .catch(optionalSource<null>(entry, "openLibrary author works", null));
  return works
    ?.filter((w) => w.workId !== excludeWorkId)
    .slice(0, MORE_BY_AUTHOR_CAP)
    .map((w) => ({ openLibraryWorkId: w.workId, title: w.title, authors: w.authors.length ? w.authors : [author], coverUrl: w.coverUrl }));
}
