import type { Author, AuthorRelation } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import { fetchMoreByAuthor, optionalSource } from "./bookEnrichment.js";
import * as openLibrary from "../sources/openLibrary.js";
import * as wikidata from "../sources/wikidata.js";
import { fetchWikipediaExtract } from "../sources/wikipedia.js";

// Wikidata data changes rarely and its SPARQL endpoint is rate-limited, so
// author lookups are cached longer than book lookups.
const authorCache = new TtlCache<Author | null>(1000 * 60 * 60 * 24, 1000, "author");

/**
 * Shared by the /api/authors and /api/graph/author routes so both hit the
 * same cache.
 *
 * Wikidata and Wikipedia are optional: a failed lookup is served with Open
 * Library's data alone and cached only briefly (see optionalSource). Caching
 * the fallback for the full 24 hours once remembered a hiccup as "this author
 * has nothing" (confirmed live: Margaret Atwood's 34 relations cached as zero).
 */
export function getAuthorDetail(openLibraryId: string): Promise<Author | null> {
  return authorCache.wrap(openLibraryId, async (entry) => {
    const ol = await openLibrary.getAuthor(openLibraryId);
    if (!ol) return null;

    const moreByAuthorPromise = fetchMoreByAuthor({ openLibraryId, name: ol.name }, null, entry);
    const qid =
      ol.wikidataId ?? (await wikidata.searchAuthorQid(ol.name).catch(optionalSource<string | null>(entry, "wikidata author search", null)));
    const [relations, wikipedia, rawPseudonyms] = qid
      ? await Promise.all([
          wikidata.fetchAuthorRelations(qid).catch(optionalSource<AuthorRelation[]>(entry, "wikidata relations", [])),
          fetchWikipediaExtract(qid).catch(optionalSource(entry, "wikipedia", null)),
          wikidata.fetchPseudonyms(qid).catch(optionalSource<string[]>(entry, "wikidata pseudonyms", [])),
        ])
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
      pseudonyms: rawPseudonyms.filter((p) => p.toLowerCase() !== ol.name.toLowerCase()),
      ...(moreByAuthor?.length && { moreByAuthor }),
    };
    return result;
  });
}
