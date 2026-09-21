import type { WorkRef } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import * as openLibrary from "../sources/openLibrary.js";

// Short-lived relative to the other caches in this app — a search query is
// free text, not a stable id like an ISBN or work id, so the cache key space
// here is effectively unbounded. A short TTL still absorbs the common case
// (a popular query, or someone re-running the same search) without holding
// stale entries around anywhere near as long as the ISBN/author/work caches
// do.
const searchCache = new TtlCache<WorkRef[]>(1000 * 60 * 10);

// Open Library's own search endpoint rejects anything shorter than this with
// a 422 ("Query too short, must be at least 3 characters") — confirmed live.
// A debounced search-as-you-type client will genuinely send a 1-2 character
// query as an intermediate state while someone's still typing, so this is
// handled the same as an empty query (no results yet) rather than being left
// to surface as an unhandled failure from whatever Open Library does with it.
const MIN_QUERY_LENGTH = 3;

/** Shared by the /api/search route. */
export function searchBooks(query: string): Promise<WorkRef[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return Promise.resolve([]);

  return searchCache.wrap(trimmed.toLowerCase(), async () => {
    const results = await openLibrary.searchWorks(trimmed);
    return results.map((r) => ({
      openLibraryWorkId: r.workId,
      title: r.title,
      authors: r.authors,
      coverUrl: r.coverUrl,
    }));
  });
}
