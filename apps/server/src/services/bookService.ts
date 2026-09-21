import type { Book } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import * as openLibrary from "../sources/openLibrary.js";
import * as googleBooks from "../sources/googleBooks.js";
import * as hardcover from "../sources/hardcover.js";
import * as wikidata from "../sources/wikidata.js";
import { combineRatings } from "../ratings.js";
import { fetchWikipediaExtract } from "../sources/wikipedia.js";
import { fetchMetadataByIsbn, mergeLabelLists } from "../sources/loc.js";

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

    // Open Library's own subjects are often just a couple of loosely-tagged
    // terms (a book's own title, one genre word), and rarely include a real
    // genre at all — so LOC's controlled, catalog-assigned subject headings
    // and genre/form terms are fetched to fill that out — started here,
    // alongside everything else below, since it doesn't depend on any of it.
    // Best-effort: most books LOC hasn't catalogued (self-published,
    // small-press) simply come back with nothing.
    const locMetadataPromise = fetchMetadataByIsbn(isbn).catch((err) => {
      console.warn(`[loc] Failed to fetch metadata for ISBN ${isbn}:`, err);
      return { subjects: [], genres: [] };
    });

    // Ratings are keyed by work on Open Library, so this needs the work id
    // resolved above — best-effort, since plenty of works simply have no
    // ratings yet.
    const olRatingsPromise = ol.workId
      ? openLibrary.getRatings(ol.workId).catch((err) => {
          console.warn(`[openLibrary] Failed to fetch ratings for work ${ol.workId}:`, err);
          return null;
        })
      : Promise.resolve(null);

    // Independent of everything else here — keyed by ISBN, not the Wikidata
    // work match below — so it's kicked off early and only awaited once
    // everything else is ready. Silently skipped (no key configured) or
    // best-effort-failed the same way every other optional source here is.
    const hardcoverPromise = hardcover.lookupByIsbn(isbn).catch((err) => {
      console.warn(`[hardcover] Lookup failed for ISBN ${isbn}:`, err);
      return null;
    });

    // Best-effort match of the work itself (not a specific edition or film
    // adaptation) to a Wikidata item, so its Wikipedia lead can be used as
    // the "about" text — the same "prefer a real summary over Open
    // Library's notes/description field" reasoning as the author bio fix,
    // just one step further upstream of Google Books instead of replacing
    // it. This is best-effort supplementary data on top of a book lookup
    // that's already fully usable without it (unlike the author-relations
    // case, a failure here is caught rather than left to fail the whole
    // request — scanning a barcode shouldn't break over a title search).
    // The same match doubles as the source for Wikidata's genre property
    // (P136), which — unlike LOC's fiction-focused GSAFD terms — covers
    // nonfiction books too.
    const firstAuthorName = ol.authors[0]?.name ?? null;
    const workQid = firstAuthorName ? await wikidata.searchWorkQid(ol.title, firstAuthorName).catch(() => null) : null;
    const [wikipedia, wikidataGenres] = workQid
      ? await Promise.all([
          fetchWikipediaExtract(workQid).catch(() => null),
          wikidata.fetchGenres(workQid).catch(() => [] as string[]),
        ])
      : [null, [] as string[]];

    // Awaited here (rather than folded into the Promise.all below) because
    // its cover, not just its rating/reviews, factors into the Google Books
    // gating decision right after this — Google Books' shared/keyless quota
    // is the one most likely to run dry, so it's only spent once both of the
    // keyless sources (Open Library, then Hardcover) have had a chance to
    // cover the same need first.
    const hc = await hardcoverPromise;

    // Google Books is only queried if neither a cover nor a description was
    // already found — Open Library's `description` is actually its `notes`
    // field (catalog/edition metadata, not a real synopsis, so it's often
    // junk like "USA/CAN"), so a non-empty value there doesn't count as
    // "already have a description" the way it used to.
    const needsGoogleBooks = (!ol.coverUrl && !hc?.coverUrl) || !(wikipedia?.text ?? ol.description);
    const gb = needsGoogleBooks ? await googleBooks.lookupByIsbn(isbn).catch(() => null) : null;
    const [locMetadata, olRatings] = await Promise.all([locMetadataPromise, olRatingsPromise]);

    const coverUrl = ol.coverUrl ?? hc?.coverUrl ?? gb?.coverUrl ?? null;
    const coverSource = ol.coverUrl ? "openLibrary" : hc?.coverUrl ? "hardcover" : gb?.coverUrl ? "googleBooks" : null;
    const description = wikipedia?.text ?? gb?.description ?? ol.description;
    const descriptionSource = wikipedia ? "wikipedia" : gb?.description ? "googleBooks" : ol.description ? "openLibrary" : null;
    // Hardcover and Open Library are blended into one count-weighted average
    // (see combineRatings) rather than picking just one. Google Books' is
    // only used on its own, as a last resort, when neither of those has a
    // rating at all — it's never blended in, since folding it in would mean
    // an extra request against its shared quota just to move the average
    // slightly (see RatingSchema).
    const rating =
      combineRatings(
        hc?.rating && hc.ratingsCount ? { average: hc.rating, count: hc.ratingsCount, source: "hardcover" } : null,
        olRatings ? { ...olRatings, source: "openLibrary" } : null
      ) ?? (gb?.rating ? { average: gb.rating.average, count: gb.rating.count, sources: ["googleBooks"] } : null);

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
