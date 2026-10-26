import type { Author } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import { fetchMoreByAuthor } from "./bookEnrichment.js";
import * as openLibrary from "../sources/openLibrary.js";
import * as wikidata from "../sources/wikidata.js";
import { fetchWikipediaExtract } from "../sources/wikipedia.js";

// Wikidata data changes rarely and its SPARQL endpoint is rate-limited, so
// author lookups are cached longer than book lookups.
const authorCache = new TtlCache<Author | null>(1000 * 60 * 60 * 24, 1000, "author");

/** The parts of an author that path search links through. */
export type AuthorLinks = Pick<Author, "openLibraryId" | "name" | "relations" | "pseudonyms">;

const authorLinksCache = new TtlCache<AuthorLinks | null>(1000 * 60 * 60 * 24, 1000, "authorLinks");

/**
 * Path search's lighter author lookup: getAuthorDetail without the Wikipedia
 * extract and "more by this author". A full author already cached is used
 * instead. Kept apart from authorCache so the author page never gets this subset.
 */
export function getAuthorLinks(openLibraryId: string): Promise<AuthorLinks | null> {
  // shortcut: an author only in the persistent tier gets the lighter lookup; read that tier too if it shows up in timings
  const full = authorCache.get(openLibraryId);
  if (full !== undefined) return Promise.resolve(full);
  return authorLinksCache.wrap(openLibraryId, async () => {
    const ol = await openLibrary.getAuthor(openLibraryId);
    if (!ol) return null;
    const qid = ol.wikidataId ?? (await wikidata.searchAuthorQid(ol.name));
    const [relations, rawPseudonyms] = qid
      ? await Promise.all([wikidata.fetchAuthorRelations(qid), wikidata.fetchPseudonyms(qid)])
      : [[], []];
    return { openLibraryId, name: ol.name, relations, pseudonyms: ownPseudonyms(rawPseudonyms, ol.name) };
  });
}

const ownPseudonyms = (names: string[], name: string) => names.filter((p) => p.toLowerCase() !== name.toLowerCase());

/**
 * Shared by the /api/authors and /api/graph/author routes so both hit the
 * same cache.
 *
 * The Wikidata search and relations lookups below used to swallow their own
 * errors and fall back to "no match" / "no relations" — which sounds safe,
 * but made a transient Wikidata failure indistinguishable from an author who
 * genuinely has no linked-data connections. Worse, since that fallback
 * value was still a *successful* result, TtlCache cached it for 24 hours,
 * so a one-off hiccup got permanently remembered as "this author has
 * nothing." (Confirmed live: Margaret Atwood's Wikidata entry has 34
 * relations, but a transient failure had this cached as zero.) Letting
 * these throw instead means a failed lookup surfaces as a real error to the
 * client instead of a false "nothing here," and doesn't get cached, so the
 * next request retries against Wikidata instead of repeating the stale
 * failure for a full day.
 */
export function getAuthorDetail(openLibraryId: string): Promise<Author | null> {
  return authorCache.wrap(openLibraryId, async (entry) => {
    const ol = await openLibrary.getAuthor(openLibraryId);
    if (!ol) return null;

    const moreByAuthorPromise = fetchMoreByAuthor({ openLibraryId, name: ol.name }, null, entry);
    const qid = ol.wikidataId ?? (await wikidata.searchAuthorQid(ol.name));
    const [relations, wikipedia, rawPseudonyms] = qid
      ? await Promise.all([wikidata.fetchAuthorRelations(qid), fetchWikipediaExtract(qid), wikidata.fetchPseudonyms(qid)])
      : [[], null, []];

    const moreByAuthor = await moreByAuthorPromise;

    // Open Library's own bio is often a single sentence (or missing
    // entirely), while Wikipedia's lead section is written to stand alone
    // as a proper summary — so it's preferred outright rather than shown
    // alongside Open Library's shorter text, which would just be a partial
    // duplicate of it in most cases (Open Library's bios are frequently
    // themselves copied from Wikipedia to begin with).
    const result: Author = {
      openLibraryId,
      name: ol.name,
      wikidataId: qid,
      bio: wikipedia?.text ?? ol.bio,
      bioSource: wikipedia ? "wikipedia" : ol.bio ? "openLibrary" : null,
      bioSourceUrl: wikipedia?.url ?? null,
      birthDate: ol.birthDate,
      deathDate: ol.deathDate,
      relations,
      pseudonyms: ownPseudonyms(rawPseudonyms, ol.name),
      ...(moreByAuthor?.length && { moreByAuthor }),
    };
    return result;
  });
}
