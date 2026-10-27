// Cheap shape checks on route params, so malformed input is rejected with a
// 400 up front instead of costing upstream requests (and a cache entry)
// just to learn it can't match anything. (ISBN checking lives in
// @book-explorer/shared, since the app's search bar needs it too.)

import { slugifySubject } from "@book-explorer/shared";

/** An Open Library author id, e.g. "OL21594A". */
export function isOpenLibraryAuthorId(id: string): boolean {
  return /^OL\d+A$/.test(id);
}

/** An Open Library work id, e.g. "OL66554W". */
export function isOpenLibraryWorkId(id: string): boolean {
  return /^OL\d+W$/.test(id);
}

/** A Wikidata item id, e.g. "Q42". */
export function isWikidataQid(id: string): boolean {
  return /^Q[1-9]\d*$/.test(id);
}

/** A raw subject slug from a URL: legacy forms are fine, but the raw text is bounded before it is slugified. */
export function isSubjectSlugInput(raw: string): boolean {
  return raw.length <= 200 && isSubjectSlug(slugifySubject(raw));
}

/** A subject slug as the graph builds it: already slugified, and short enough to be a real subject. */
export function isSubjectSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 200 && slugifySubject(slug) === slug;
}

/** A graph node id the path finder can start or end at, e.g. "work:OL66554W". */
export function isPathEndpointId(nodeId: string): boolean {
  const sep = nodeId.indexOf(":");
  const type = nodeId.slice(0, sep);
  const id = nodeId.slice(sep + 1);
  if (type === "author") return isOpenLibraryAuthorId(id);
  if (type === "work") return isOpenLibraryWorkId(id);
  // Legacy and unslugified ids are accepted; the path route canonicalizes them.
  if (type === "subject" || type === "genre") return isSubjectSlugInput(id);
  return false;
}

export const SEARCH_SORTS = ["relevance", "new", "old", "rating", "readinglog"] as const;

export interface SearchFilters {
  author?: string;
  subject?: string;
  language?: string;
  yearFrom?: number;
  yearTo?: number;
  sort?: (typeof SEARCH_SORTS)[number];
}

const MAX_FILTER_TEXT = 100;

/**
 * Validates the raw /api/search filter params. Returns the typed filters, or
 * an error message for the 400 (malformed years, unknown sort/language, ...).
 */
export function parseSearchFilters(raw: Record<string, unknown>): SearchFilters | string {
  // A repeated param (?author=a&author=b) arrives as an array.
  for (const [key, v] of Object.entries(raw)) {
    if (v !== undefined && typeof v !== "string") return `'${key}' must be a single value`;
  }
  const r = raw as Record<string, string | undefined>;
  const out: SearchFilters = {};
  for (const key of ["author", "subject"] as const) {
    const v = r[key]?.trim();
    if (!v) continue;
    if (v.length > MAX_FILTER_TEXT) return `'${key}' is too long`;
    out[key] = v;
  }
  if (r.language) {
    // Open Library uses 3-letter ISO 639-2 codes, e.g. "eng".
    if (!/^[a-z]{3}$/.test(r.language)) return "'language' must be a 3-letter code";
    out.language = r.language;
  }
  for (const key of ["yearFrom", "yearTo"] as const) {
    if (!r[key]) continue;
    if (!/^\d{4}$/.test(r[key]!)) return `'${key}' must be a 4-digit year`;
    out[key] = Number(r[key]);
  }
  if (out.yearFrom && out.yearTo && out.yearFrom > out.yearTo) return "'yearFrom' must not be after 'yearTo'";
  if (r.sort) {
    if (!(SEARCH_SORTS as readonly string[]).includes(r.sort)) return "'sort' must be relevance, new, old, rating or readinglog";
    out.sort = r.sort as SearchFilters["sort"];
  }
  return out;
}
