import type { WorkRef } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import * as openLibrary from "../sources/openLibrary.js";
import type { SearchFilters } from "../validation.js";

// Short-lived relative to the other caches in this app — a search query is
// free text, not a stable id like an ISBN or work id, so the cache key space
// here is effectively unbounded. A short TTL still absorbs the common case
// (a popular query, or someone re-running the same search) without holding
// stale entries around anywhere near as long as the ISBN/author/work caches
// do.
const searchCache = new TtlCache<WorkRef[]>(1000 * 60 * 10, 1000, "search");

// Open Library's own search endpoint rejects anything shorter than this with
// a 422 ("Query too short, must be at least 3 characters") — confirmed live.
// A debounced search-as-you-type client will genuinely send a 1-2 character
// query as an intermediate state while someone's still typing, so this is
// handled the same as an empty query (no results yet) rather than being left
// to surface as an unhandled failure from whatever Open Library does with it.
const MIN_QUERY_LENGTH = 3;

// Values go into Open Library's Lucene query inside double quotes, so only
// quotes and backslashes need escaping to keep a value from breaking out.
const quote = (v: string) => `"${v.replace(/["\\]/g, "\\$&")}"`;

/** Builds the Open Library `q` string; exported for tests. */
export function buildQuery(text: string, f: SearchFilters): string {
  // Free text stays unquoted, as before: it is the user's own search.
  const parts = [text.trim()];
  if (f.author) parts.push(`author:${quote(f.author)}`);
  if (f.subject) parts.push(`subject:${quote(f.subject)}`);
  if (f.language) parts.push(`language:${f.language}`);
  if (f.yearFrom || f.yearTo) parts.push(`first_publish_year:[${f.yearFrom ?? "*"} TO ${f.yearTo ?? "*"}]`);
  return parts.filter(Boolean).join(" ");
}

/** Shared by the /api/search route. */
export function searchBooks(query: string, filters: SearchFilters = {}): Promise<WorkRef[]> {
  const trimmed = query.trim();
  // The 3-char minimum applies to whatever text drives the search: the free
  // text, or (when there is none) an author/subject filter.
  const drivers = [trimmed, filters.author, filters.subject];
  if (!drivers.some((d) => (d?.length ?? 0) >= MIN_QUERY_LENGTH)) return Promise.resolve([]);

  const q = buildQuery(trimmed, filters);
  const sort = filters.sort === "relevance" ? undefined : filters.sort;
  // Every filter is in q or sort, so this key differs per filter.
  return searchCache.wrap(`${q.toLowerCase()}|${sort ?? ""}`, async () => {
    const results = await openLibrary.searchWorks(q, 20, sort);
    return results.map((r) => ({
      openLibraryWorkId: r.workId,
      title: r.title,
      authors: r.authors,
      coverUrl: r.coverUrl,
    }));
  });
}
