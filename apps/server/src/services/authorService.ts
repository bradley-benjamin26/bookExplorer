import type { Author } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import * as openLibrary from "../sources/openLibrary.js";
import * as wikidata from "../sources/wikidata.js";

// Wikidata data changes rarely and its SPARQL endpoint is rate-limited, so
// author lookups are cached longer than book lookups.
const authorCache = new TtlCache<Author | null>(1000 * 60 * 60 * 24);

/** Shared by the /api/authors and /api/graph/author routes so both hit the same cache. */
export function getAuthorDetail(openLibraryId: string): Promise<Author | null> {
  return authorCache.wrap(openLibraryId, async () => {
    const ol = await openLibrary.getAuthor(openLibraryId);
    if (!ol) return null;

    const qid = ol.wikidataId ?? (await wikidata.searchAuthorQid(ol.name).catch(() => null));
    const relations = qid ? await wikidata.fetchAuthorRelations(qid).catch(() => []) : [];

    const result: Author = {
      openLibraryId,
      name: ol.name,
      wikidataId: qid,
      bio: ol.bio,
      birthDate: ol.birthDate,
      deathDate: ol.deathDate,
      relations,
    };
    return result;
  });
}
