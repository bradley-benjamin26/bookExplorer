import type { Series } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import * as openLibrary from "../sources/openLibrary.js";
import * as wikidata from "../sources/wikidata.js";
import { optionalSource } from "./bookEnrichment.js";

// Wikidata series membership changes rarely, so cached as long as authors.
const seriesCache = new TtlCache<Series | null>(1000 * 60 * 60 * 24, 500, "series");

const LOOKUP_CONCURRENCY = 4;

export function getSeriesDetail(qid: string): Promise<Series | null> {
  return seriesCache.wrap(qid, async (entry) => {
    const series = await wikidata.fetchSeries(qid);
    if (!series) return null;
    const members: Series["members"] = new Array(series.members.length);
    let next = 0;
    // A series can have up to 100 members, so a few workers share the list rather than firing 100 searches at once.
    const worker = async () => {
      while (next < series.members.length) {
        const i = next++;
        const { authorName, ...m } = series.members[i];
        // Wikidata's Open Library id can be a merged work; title + author finds the live one. No author: a title-only search could match another book.
        const found = authorName
          ? await openLibrary.findWork(m.title, authorName).catch(optionalSource(entry, "openLibrary series lookup", null))
          : null;
        members[i] = { ...m, openLibraryWorkId: found?.workId ?? m.openLibraryWorkId, coverUrl: found?.coverUrl ?? null };
      }
    };
    await Promise.all(Array.from({ length: LOOKUP_CONCURRENCY }, worker));
    return { ...series, members };
  });
}
