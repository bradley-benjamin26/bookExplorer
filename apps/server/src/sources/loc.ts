import { fetchWithTimeout } from "../httpClient.js";
import { tryEachIsbn } from "../isbnFallback.js";
import { USER_AGENT } from "./openLibrary.js";

// The SRU gateway onto the Library of Congress's own bibliographic database
// (distinct from — and far more complete for print books than — the
// www.loc.gov/search endpoint, which mostly indexes digitized collections
// like photographs). Documented at https://www.loc.gov/z3950/lcdb.html;
// plain HTTP is what LOC itself serves this on, there's no HTTPS variant.
const SRU_URL = "http://lx2.loc.gov:210/lcdb";

export interface LocMetadata {
  subjects: string[];
  genres: string[];
}

const EMPTY_METADATA: LocMetadata = { subjects: [], genres: [] };

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

const RECORD_ISBN_RE = /<identifier type="isbn">([^<]*)<\/identifier>/g;
const SUBJECT_BLOCK_RE = /<subject\b([^>]*)>([\s\S]*?)<\/subject>/g;
// MODS orders a subject heading's parts (topic/geographic/temporal/genre) the
// same way LCSH itself displays them, joined with " -- " between each part —
// e.g. "Electronic data processing -- Moral and ethical aspects".
const SUBJECT_PART_RE = /<(?:topic|geographic|temporal|genre)>([\s\S]*?)<\/(?:topic|geographic|temporal|genre)>/g;
// A top-level (not nested in <subject>) <genre> element tagged "gsafd" is a
// term from Guidelines on Subject Access to Individual Works of Fiction,
// Drama, Etc. — a controlled vocabulary built specifically to answer "what
// genre is this" (confirmed live: "Mystery fiction.", "Science fiction.",
// "Fantasy fiction."), unlike the broader/vaguer "lcgft" genre/form terms
// MODS records also carry (almost always just "Fiction." or nothing at all),
// or unlabeled <genre> elements from other local thesauri. Assigned mainly to
// fiction/drama/poetry, so nonfiction books typically won't have one — that's
// expected, not a bug, and is exactly why Wikidata's P136 is used alongside
// it as a second, nonfiction-inclusive source.
const GSAFD_GENRE_RE = /<genre\b([^>]*)>([\s\S]*?)<\/genre>/g;

/**
 * Parses the handful of MODS fields this needs out of an SRU response with
 * targeted regexes rather than pulling in a full XML parser dependency — the
 * shape here is simple and stable (verified against live records) enough
 * that a DOM parse would be more machinery than the one thing being
 * extracted calls for.
 */
function parseModsRecord(xml: string, isbn: string): LocMetadata {
  // The SRU index isn't a strict ISBN-equality match (confirmed live: a
  // clearly-invalid ISBN like "0000000000000" still returned an unrelated
  // record, apparently one with that same placeholder value stuck in a
  // digitized identifier field) — so the returned record's own identifiers
  // are checked before its subjects are trusted, rather than assuming a hit
  // means what was searched for.
  const recordIsbns = [...xml.matchAll(RECORD_ISBN_RE)].map((m) => m[1].replace(/[^0-9Xx]/g, "").toUpperCase());
  if (!recordIsbns.includes(isbn)) return EMPTY_METADATA;

  const subjects: string[] = [];
  for (const [, attrs, body] of xml.matchAll(SUBJECT_BLOCK_RE)) {
    if (!/authority="lcsh"/.test(attrs)) continue;
    const parts = [...body.matchAll(SUBJECT_PART_RE)].map((m) => decodeXmlEntities(m[1]).trim());
    if (parts.length > 0) subjects.push(parts.join(" -- "));
  }

  // GSAFD terms are conventionally catalogued with a trailing period
  // ("Mystery fiction.") that reads oddly as a standalone UI label. Attributes
  // are captured and tested separately (rather than baked into the regex's
  // literal text, as this used to do) so a record that orders/spaces a
  // <genre> element's attributes differently than usual still matches — the
  // same reasoning as the "lcsh" check on SUBJECT_BLOCK_RE above.
  const genres = [...xml.matchAll(GSAFD_GENRE_RE)]
    .filter(([, attrs]) => /authority="gsafd"/.test(attrs))
    .map(([, , body]) => decodeXmlEntities(body).trim().replace(/\.$/, ""));

  return { subjects, genres: [...new Set(genres)] };
}

/**
 * Library of Congress Subject Headings (LCSH) and GSAFD genre/form terms for
 * the print edition matching this ISBN. Open Library's own `subjects` are
 * often extremely sparse — sometimes just the book's own title and a single
 * genre tag, since anyone can add them — while LOC catalogers assign a
 * controlled, structured set of subject headings (and, for most fiction, a
 * genre term) to nearly every print book that passes through their
 * cataloging pipeline. Returns empty arrays (not an error) when LOC simply
 * hasn't catalogued this ISBN at all, which is common for self-published and
 * small-press books.
 */
export async function fetchMetadataByIsbn(isbn: string): Promise<LocMetadata> {
  const normalizedIsbn = isbn.replace(/[^0-9Xx]/g, "").toUpperCase();
  const query = `bath.isbn=${normalizedIsbn}`;
  const url = `${SRU_URL}?version=1.1&operation=searchRetrieve&query=${encodeURIComponent(query)}&maximumRecords=1&recordSchema=mods`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Library of Congress request failed: ${res.status}`);
  const xml = await res.text();
  return parseModsRecord(xml, normalizedIsbn);
}

/**
 * Tries each ISBN in turn, returning the first result with any subjects or
 * genres. Meant for a "work" (edition-agnostic in this app's own model
 * already), where any one of several editions being LOC-catalogued is as
 * good as another — the alternative, only ever trying whichever edition Open
 * Library happened to list first, misses catalogued editions further down
 * that same list for no reason but list order (confirmed live: one work's
 * first-listed edition was a Polish translation LOC has no record of, while
 * an English edition a few entries later did have one). Capped so a work
 * with no catalogued edition at all doesn't cost more than a handful of
 * requests finding that out.
 */
export function fetchMetadataByAnyIsbn(isbns: string[], maxAttempts = 5): Promise<LocMetadata> {
  return tryEachIsbn(isbns, fetchMetadataByIsbn, {
    sourceName: "loc",
    isEmpty: (metadata) => metadata.subjects.length === 0 && metadata.genres.length === 0,
    fallback: EMPTY_METADATA,
    maxAttempts,
  });
}

/** Combines label lists from multiple sources, case-insensitively deduplicated, keeping the first-seen spelling and preferring earlier lists' ordering. */
export function mergeLabelLists(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const label of lists.flat()) {
    const key = label.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(label);
  }
  return merged;
}
