import type { Book } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import * as openLibrary from "../sources/openLibrary.js";
import * as googleBooks from "../sources/googleBooks.js";
import * as wikidata from "../sources/wikidata.js";
import { fetchWikipediaExtract } from "../sources/wikipedia.js";
import { mergeLabelLists } from "../sources/loc.js";
import { startCommonEnrichment, blendHardcoverAndOpenLibraryRating, findWorkQid } from "./bookEnrichment.js";

const bookCache = new TtlCache<Book | null>(1000 * 60 * 60);

// ISBNs are sometimes hyphenated for display (e.g. "978-0-06-325085-7", or a
// URL typed/pasted with dashes, as opposed to a barcode scan which yields
// bare digits) — Open Library's own API tolerates and normalizes these
// itself, but Hardcover's lookup is an exact match against a dash-free
// column, so a hyphenated ISBN silently fails to match there even though the
// book is in fact in Hardcover's catalog. Stripping once here, before any
// source is queried, keeps every downstream lookup (and the cache key) on
// the same normalized form.
function normalizeIsbn(isbn: string): string {
  return isbn.replace(/[^0-9Xx]/g, "");
}

/** Shared by the /api/books route (a future /api/graph/book route would reuse this too). */
export function getBookDetail(rawIsbn: string): Promise<Book | null> {
  const isbn = normalizeIsbn(rawIsbn);
  return bookCache.wrap(isbn, async () => {
    const ol = await openLibrary.lookupByIsbn(isbn);
    if (!ol) return null;

    // LOC subject/genre headings, Hardcover, and Open Library's own ratings
    // — same shared pipeline a work page uses (see bookEnrichment.ts),
    // started here, alongside everything else below, since none of it
    // depends on any of it.
    const { locMetadataPromise, hardcoverPromise, olRatingsPromise } = startCommonEnrichment([isbn], ol.workId);

    // Best-effort match of the work itself (not a specific edition or film
    // adaptation) to a Wikidata item, so its Wikipedia lead can be used as
    // the "about" text — the same "prefer a real summary over Open
    // Library's notes/description field" reasoning as the author bio fix,
    // just one step further upstream of Google Books instead of replacing
    // it. This is best-effort supplementary data on top of a book lookup
    // that's already fully usable without it (unlike the author-relations
    // case, a failure here is caught rather than left to fail the whole
    // request — scanning a barcode shouldn't break over a title search).
    const firstAuthorName = ol.authors[0]?.name ?? null;
    const workQid = await findWorkQid(ol.title, firstAuthorName);
    const [wikipedia, wikidataGenres] = workQid
      ? await Promise.all([
          fetchWikipediaExtract(workQid).catch(() => null),
          wikidata.fetchGenres(workQid).catch(() => [] as string[]),
        ])
      : [null, [] as string[]];

    // Awaited here (rather than folded into the Promise.all below) because
    // its cover and rating, not just its reviews, factor into the Google
    // Books gating decision right after this — Google Books' shared/keyless
    // quota is the one most likely to run dry, so it's only spent once both
    // of the keyless sources (Open Library, then Hardcover) have had a
    // chance to cover the same need first.
    const [hc, olRatings] = await Promise.all([hardcoverPromise, olRatingsPromise]);

    // Google Books is only queried if a cover, a description, or a rating
    // wasn't already found from the keyless sources above — Open Library's
    // `description` is actually its `notes` field (catalog/edition metadata,
    // not a real synopsis, so it's often junk like "USA/CAN"), so a
    // non-empty value there doesn't count as "already have a description"
    // the way it used to. Checking rating here too (rather than only
    // consulting gb?.rating below when gb happens to already be non-null for
    // another reason) means a book with a cover and description from other
    // sources, but no rating anywhere else, still gets a chance at Google
    // Books' rating instead of silently showing none.
    const hasRating = Boolean(hc?.rating && hc.ratingsCount) || Boolean(olRatings);
    const needsGoogleBooks = (!ol.coverUrl && !hc?.coverUrl) || !(wikipedia?.text ?? ol.description) || !hasRating;
    const gb = needsGoogleBooks ? await googleBooks.lookupByIsbn(isbn).catch(() => null) : null;
    const locMetadata = await locMetadataPromise;

    const coverUrl = ol.coverUrl ?? hc?.coverUrl ?? gb?.coverUrl ?? null;
    const coverSource = ol.coverUrl ? "openLibrary" : hc?.coverUrl ? "hardcover" : gb?.coverUrl ? "googleBooks" : null;
    const description = wikipedia?.text ?? gb?.description ?? ol.description;
    const descriptionSource = wikipedia ? "wikipedia" : gb?.description ? "googleBooks" : ol.description ? "openLibrary" : null;
    // Google Books' rating is only used on its own, as a last resort, when
    // neither Hardcover nor Open Library has one at all — it's never
    // blended in, since folding it in would mean an extra request against
    // its shared quota just to move the average slightly (see RatingSchema).
    const rating =
      blendHardcoverAndOpenLibraryRating(hc, olRatings) ??
      (gb?.rating ? { average: gb.rating.average, count: gb.rating.count, sources: ["googleBooks" as const] } : null);

    const result: Book = {
      isbn,
      title: ol.title,
      authors: ol.authors,
      subjects: mergeLabelLists(locMetadata.subjects, ol.subjects),
      genres: mergeLabelLists(locMetadata.genres, wikidataGenres),
      description,
      descriptionSource,
      descriptionSourceUrl: wikipedia?.url ?? null,
      coverUrl,
      coverSource,
      openLibraryWorkId: ol.workId,
      openLibraryEditionId: ol.editionId,
      wikidataId: workQid,
      format: ol.format,
      rating,
      reviews: hc?.reviews ?? [],
    };
    return result;
  });
}
