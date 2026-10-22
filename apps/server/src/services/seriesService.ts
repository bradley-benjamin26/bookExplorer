import type { Series } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import * as wikidata from "../sources/wikidata.js";

// Wikidata series membership changes rarely, so cached as long as authors.
const seriesCache = new TtlCache<Series | null>(1000 * 60 * 60 * 24, 500, "series");

export function getSeriesDetail(qid: string): Promise<Series | null> {
  return seriesCache.wrap(qid, () => wikidata.fetchSeries(qid));
}
