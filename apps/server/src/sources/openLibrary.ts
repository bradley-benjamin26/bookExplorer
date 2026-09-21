import type { AuthorRef } from "@book-explorer/shared";
import { fetchWithTimeout } from "../httpClient.js";

export const USER_AGENT = "BookExplorer/0.1 (contact: bbradle1@umd.edu)";

// Open Library appends auto-generated metadata to some descriptions/notes
// after a "----------" divider line — most commonly "Also contained in:" or
// "Also contains:" followed by a list of markdown links to other works
// (confirmed live on "The Handmaid's Tale": the human-written synopsis, then
// "----------\nAlso contained in:\n[Novels](https://openlibrary.org/works/...)").
// Rendered as plain text (this app doesn't render markdown), that shows up
// as literal, broken-looking "[Novels](https://...)" clutter, so everything
// from the divider onward is dropped rather than displayed.
function stripOpenLibraryTrailer(text: string): string {
  // Open Library's own text uses \r\n line endings, not bare \n.
  return text.replace(/\r?\n-{3,}\r?\n[\s\S]*$/, "").trim();
}

interface OpenLibraryBookData {
  title?: string;
  authors?: { url: string; name: string }[];
  subjects?: { name: string; url: string }[];
  cover?: { small?: string; medium?: string; large?: string };
  notes?: string | { value: string };
  key?: string;
}

export interface OpenLibraryResult {
  title: string;
  authors: AuthorRef[];
  subjects: string[];
  coverUrl: string | null;
  description: string | null;
  workId: string | null;
  editionId: string | null;
  format: string | null;
}

// Returns null instead of throwing on a malformed entry — Open Library is a
// public wiki, so one odd author record shouldn't take down an otherwise
// good book/work/subject response over a field that's only used for a link.
function extractAuthorId(url: string): string | null {
  const match = url.match(/\/authors\/(OL\w+A)/);
  if (!match) {
    console.warn(`[openLibrary] Could not parse author id from "${url}"`);
    return null;
  }
  return match[1];
}

interface OpenLibraryAuthorData {
  name?: string;
  bio?: string | { value: string };
  birth_date?: string;
  death_date?: string;
  remote_ids?: { wikidata?: string };
  type?: { key?: string };
  location?: string;
}

export interface OpenLibraryAuthor {
  name: string;
  bio: string | null;
  birthDate: string | null;
  deathDate: string | null;
  wikidataId: string | null;
}

// Author ids merge over time (two catalog entries for the same real person
// getting consolidated), and Open Library leaves a redirect stub behind at
// the old id rather than removing it. Confirmed live: Wikidata's own P648
// (Open Library id) for Henry Fielding lists *two* ids, one of which
// (OL3894951A) is exactly this — a redirect with no `name` field at all,
// which would otherwise have shown the literal id as his "name". `depth`
// just guards against an implausible redirect chain looping forever.
export async function getAuthor(openLibraryId: string, depth = 0): Promise<OpenLibraryAuthor | null> {
  const url = `https://openlibrary.org/authors/${encodeURIComponent(openLibraryId)}.json`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Library request failed: ${res.status}`);

  const data = (await res.json()) as OpenLibraryAuthorData;

  if (data.type?.key === "/type/redirect" && data.location && depth < 3) {
    return getAuthor(data.location.replace("/authors/", ""), depth + 1);
  }

  const bio = typeof data.bio === "string" ? data.bio : data.bio?.value ?? null;

  return {
    name: data.name ?? openLibraryId,
    bio,
    birthDate: data.birth_date ?? null,
    deathDate: data.death_date ?? null,
    wikidataId: data.remote_ids?.wikidata ?? null,
  };
}

interface OpenLibraryWorkData {
  title?: string;
  authors?: { author?: { key?: string } }[];
  covers?: number[];
  description?: string | { value: string };
  subjects?: string[];
}

export interface OpenLibraryEdition {
  openLibraryEditionId: string;
  isbn: string | null;
  // Open Library's own catalog term for this printing's physical form —
  // "Paperback", "Hardcover", "eAudiobook", etc. Not controlled/normalized
  // (it's whichever string the cataloguer typed), so it's shown as-is rather
  // than mapped onto a fixed set of formats this app would have to keep
  // extending.
  format: string | null;
  publisher: string | null;
  publishDate: string | null;
  coverUrl: string | null;
}

export interface OpenLibraryWork {
  title: string;
  authors: AuthorRef[];
  coverUrl: string | null;
  description: string | null;
  subjects: string[];
  isbn: string | null;
  // Every edition ISBN found, in Open Library's own listing order — `isbn`
  // above is just this list's first entry. Exposed separately so a caller
  // that can afford to try more than one (e.g. an LCSH lookup, which most
  // editions of a work won't individually be catalogued under) isn't stuck
  // with whichever edition happened to be listed first, which is no more
  // than an accident of Open Library's ordering (confirmed live: a work's
  // first-listed edition was a Polish translation, with several English
  // editions further down the same list).
  isbnCandidates: string[];
  // Every edition with enough data to be worth showing (a cover, ISBN,
  // format, publisher, or publish date — Open Library's editions listing
  // also contains plenty of bare stub records with none of these, which
  // would otherwise render as an empty, unlabeled card).
  editions: OpenLibraryEdition[];
}

interface OpenLibraryEditionsData {
  entries?: {
    key?: string;
    isbn_13?: string[];
    isbn_10?: string[];
    languages?: { key?: string }[];
    physical_format?: string;
    publishers?: string[];
    publish_date?: string;
    covers?: number[];
  }[];
}

// A "work" in Open Library's own model is edition-agnostic — Pride and
// Prejudice-the-work has no ISBN of its own; each of its ~4,000 printings
// (editions) does. This collects every edition's ISBN and display metadata
// (preferring ISBN-13 per edition), so work pages reached other than by
// scanning (a graph node, an author's notable-works list, a subject's book
// list) can still offer the same ISBN-based links (Bookshop.org, WorldCat,
// local library) the book page does, and so an "Editions" section can show
// what printings actually exist. Most editions in a typical batch do have an
// ISBN (spot-checked: 30 of the first 50 for a popular work, 12 of 15 for a
// less common one), so a single reasonably-sized page is enough without
// pagination.
async function getWorkEditions(workId: string): Promise<OpenLibraryEdition[]> {
  const url = `https://openlibrary.org/works/${encodeURIComponent(workId)}/editions.json?limit=50`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Open Library request failed: ${res.status}`);

  const data = (await res.json()) as OpenLibraryEditionsData;
  const editions: (OpenLibraryEdition & { nonEnglish: boolean })[] = [];
  for (const entry of data.entries ?? []) {
    const coverId = entry.covers?.find((c) => c > 0);
    const edition: OpenLibraryEdition = {
      openLibraryEditionId: (entry.key ?? "").replace("/books/", ""),
      isbn: entry.isbn_13?.[0] ?? entry.isbn_10?.[0] ?? null,
      format: entry.physical_format ?? null,
      publisher: entry.publishers?.[0] ?? null,
      publishDate: entry.publish_date ?? null,
      coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null,
    };
    // A stub record with nothing to show (no cover, no ISBN, no format,
    // no publisher, no date) isn't worth a card in an editions list.
    if (!edition.isbn && !edition.coverUrl && !edition.format && !edition.publisher && !edition.publishDate) {
      continue;
    }
    const nonEnglish = (entry.languages ?? []).some((l) => l.key && l.key !== "/languages/eng");
    editions.push({ ...edition, nonEnglish });
  }

  // Stable-sorted (Array#sort has been spec-guaranteed stable since ES2019)
  // so English and language-unlabeled editions — this app's own users are
  // assumed English-reading — come first without disturbing their relative
  // order, while confirmed non-English editions are demoted rather than
  // dropped. Open Library's own listing order has no language preference at
  // all: confirmed live, a work's first-listed edition was a Polish
  // translation, with several English editions further down the same list,
  // which otherwise surfaced as a Polish ISBN in Bookshop.org/WorldCat
  // search links meant for an English-language reader.
  const ordered = [...editions].sort((a, b) => Number(a.nonEnglish) - Number(b.nonEnglish));

  // Two distinct Open Library edition *records* sharing one ISBN would
  // otherwise show up as two seemingly-identical cards in an editions list
  // (same real printing, catalogued twice) — not observed in spot checks,
  // but cheap to guard against. Two editions with *different* ISBNs are kept
  // as separate entries even when their publisher/format/year all match
  // (e.g. two "HarperCollins Publishers Limited, 2023" editions in the same
  // work's list) — that combination isn't unusual for a publisher issuing
  // several printings/imprints of the same book in one year, and a
  // different ISBN means Open Library itself is treating them as different
  // catalog records, not this app's own duplicate to collapse. `null` isbn
  // editions are never deduped against each other, since there's no
  // reliable signal that two of those are actually the same printing.
  const seenIsbns = new Set<string>();
  const deduped = ordered.filter((edition) => {
    if (!edition.isbn) return true;
    if (seenIsbns.has(edition.isbn)) return false;
    seenIsbns.add(edition.isbn);
    return true;
  });

  return deduped.map(({ nonEnglish, ...edition }) => edition);
}

export async function getWork(workId: string): Promise<OpenLibraryWork | null> {
  const url = `https://openlibrary.org/works/${encodeURIComponent(workId)}.json`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Library request failed: ${res.status}`);

  const data = (await res.json()) as OpenLibraryWorkData;

  const authorIds = (data.authors ?? [])
    .map((a) => a.author?.key)
    .filter((key): key is string => !!key)
    .map((key) => key.replace("/authors/", ""));

  // Work records only reference authors by id, so their names are resolved
  // with a lookup per author (cached separately by the authors route/cache).
  const [authors, editions] = await Promise.all([
    Promise.all(
      authorIds.map(async (id) => {
        const author = await getAuthor(id).catch((err) => {
          console.warn(`[openLibrary] Failed to resolve author name for ${id}:`, err);
          return null;
        });
        // Falling back to the raw id as a "name" is deliberately visible (it
        // looks like "OL21594A" rather than a person's name) so a resolution
        // failure shows up as an obviously wrong label instead of silently
        // passing for a real one.
        return { openLibraryId: id, name: author?.name ?? id };
      })
    ),
    // Non-fatal and best-effort: this only unlocks a few extra links/an
    // editions list on the work page, so a failure here shouldn't take down
    // the rest of an otherwise-good response.
    getWorkEditions(workId).catch((err) => {
      console.warn(`[openLibrary] Failed to resolve editions for work ${workId}:`, err);
      return [] as OpenLibraryEdition[];
    }),
  ]);

  const isbnCandidates = [...new Set(editions.map((e) => e.isbn).filter((isbn): isbn is string => !!isbn))];

  const rawDescription = typeof data.description === "string" ? data.description : data.description?.value ?? null;
  const description = rawDescription ? stripOpenLibraryTrailer(rawDescription) : null;
  const coverId = data.covers?.find((c) => c > 0);

  return {
    title: data.title ?? "Unknown title",
    authors,
    coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null,
    description,
    subjects: data.subjects ?? [],
    isbn: isbnCandidates[0] ?? null,
    isbnCandidates,
    editions,
  };
}

interface OpenLibrarySubjectData {
  name?: string;
  work_count?: number;
  works?: {
    key: string;
    title: string;
    cover_id?: number;
    authors?: { key: string; name: string }[];
  }[];
}

export interface OpenLibrarySubjectWork {
  workId: string;
  title: string;
  authors: AuthorRef[];
  coverUrl: string | null;
}

export interface OpenLibrarySubject {
  name: string;
  workCount: number;
  works: OpenLibrarySubjectWork[];
}

export interface OpenLibrarySearchResult {
  workId: string;
  title: string;
  authors: AuthorRef[];
  coverUrl: string | null;
}

/**
 * Free-text title/author search, used as the entry point into the rest of
 * this app for someone who doesn't already have an ISBN in hand (browsing a
 * shelf, a friend's recommendation, ...) — Open Library's own search index
 * is used rather than fanning this out to Hardcover/Google Books too,
 * since those sources have no equivalent "resolve a fuzzy query to a
 * canonical work" search of their own, and this app already treats an Open
 * Library work id as the identity everything else (ratings, editions,
 * genres) gets hung off of once a specific book is chosen — the same
 * `getWorkDetail` pipeline a search result feeds into already does that
 * enrichment, so search itself only needs to resolve "what work is this."
 */
export async function searchWorks(query: string, limit = 20): Promise<OpenLibrarySearchResult[]> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(
    query
  )}&fields=key,title,author_name,author_key,cover_i&limit=${limit}`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Open Library search request failed: ${res.status}`);

  const data = (await res.json()) as {
    docs?: { key?: string; title?: string; author_name?: string[]; author_key?: string[]; cover_i?: number }[];
  };

  // Skips a result entirely if it has no work key rather than throwing —
  // same reasoning as extractAuthorId above.
  return (data.docs ?? []).flatMap((doc) => {
    if (!doc.key || !doc.title) return [];
    const authorNames = doc.author_name ?? [];
    const authorKeys = doc.author_key ?? [];
    return [
      {
        workId: doc.key.replace("/works/", ""),
        title: doc.title,
        // author_name/author_key are parallel arrays, but Open Library
        // doesn't guarantee they're always the same length — zipping only
        // as far as both extend, rather than assuming it, avoids pairing a
        // name with the wrong id if one is ever short.
        authors: authorNames
          .slice(0, authorKeys.length)
          .map((name, i) => ({ openLibraryId: authorKeys[i], name })),
        coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
      },
    ];
  });
}

export async function getSubject(slug: string, limit = 20): Promise<OpenLibrarySubject | null> {
  const url = `https://openlibrary.org/subjects/${encodeURIComponent(slug)}.json?limit=${limit}`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Library request failed: ${res.status}`);

  const data = (await res.json()) as OpenLibrarySubjectData;
  if (!data.works) return null;

  return {
    name: data.name ?? slug,
    workCount: data.work_count ?? 0,
    // Skips a work entry entirely if it has no key rather than throwing —
    // same reasoning as extractAuthorId above.
    works: data.works.flatMap((w) => {
      if (!w.key) {
        console.warn(`[openLibrary] Subject "${slug}" has a work with no key: ${w.title}`);
        return [];
      }
      return [
        {
          workId: w.key.replace("/works/", ""),
          title: w.title,
          authors: (w.authors ?? [])
            .filter((a) => a.key)
            .map((a) => ({ openLibraryId: a.key.replace("/authors/", ""), name: a.name })),
          coverUrl: w.cover_id ? `https://covers.openlibrary.org/b/id/${w.cover_id}-M.jpg` : null,
        },
      ];
    }),
  };
}

export interface OpenLibraryAuthorWork {
  workId: string;
  title: string;
}

/**
 * An author's full bibliography, straight from Open Library — distinct from
 * the "notable works" a Wikidata author graph shows, which only reflects
 * whatever a handful of editors bothered to tag with P800 and is often far
 * sparser than what Open Library actually has catalogued (seen live: an
 * author with 23 cataloged works had only 2 P800 statements on Wikidata).
 *
 * Uses the general search API (rather than /authors/{id}/works.json) because
 * its `language` field lets non-English editions/translations be filtered
 * out here, at no extra request cost — an author's foreign-language
 * translations are otherwise cataloged as their own separate "work" records
 * with titles that share no text with the English one (e.g. "Grillo en
 * Times Square" alongside "The Cricket in Times Square"), which title-based
 * de-duplication alone can't merge. A work with no language recorded at all
 * is kept rather than dropped, since plenty of legitimately-English Open
 * Library records simply have no language metadata set — this is a
 * best-effort filter, not a guarantee every result is English (confirmed
 * live: one Spanish edition with no language tag at all still slips
 * through).
 */
export async function getAuthorWorks(openLibraryId: string, limit = 15): Promise<OpenLibraryAuthorWork[]> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(
    `author_key:${openLibraryId}`
  )}&fields=title,key,language&limit=${Math.max(limit * 2, 40)}`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Open Library request failed: ${res.status}`);

  const data = (await res.json()) as { docs?: { key: string; title: string; language?: string[] }[] };
  return (data.docs ?? [])
    .filter((d) => d.key && d.title && (!d.language || d.language.includes("eng")))
    .slice(0, limit)
    .map((d) => ({ workId: d.key.replace("/works/", ""), title: d.title }));
}

interface AuthorSearchResult {
  docs?: { key: string; name: string }[];
}

/**
 * Best-effort match of a plain name (e.g. a pen name from Wikidata) to an
 * Open Library author record. Open Library's author search ranks by
 * relevance/notability, so the top hit is used the same way the existing
 * Wikidata name-search heuristics already do elsewhere in this app — not
 * guaranteed correct, but a reasonable best effort for a supplementary data
 * source rather than the primary lookup.
 */
export async function searchAuthorByName(name: string): Promise<{ openLibraryId: string; name: string } | null> {
  const url = `https://openlibrary.org/search/authors.json?q=${encodeURIComponent(name)}&limit=1`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Open Library request failed: ${res.status}`);

  const data = (await res.json()) as AuthorSearchResult;
  const doc = data.docs?.[0];
  return doc ? { openLibraryId: doc.key, name: doc.name } : null;
}

// The `volumes/brief` response below doesn't include a work reference at
// all (verified against the live API — it's simply not one of the fields
// it returns), so getting one costs a second request to the edition record
// it does point to. Failure here is non-fatal: the rest of the book's data
// is still useful without a work id, it just can't link into the graph.
// Same "id, then a second request for the record itself" shape as
// resolveWorkId used to be alone — bundled into one fetch (rather than a
// second one just for `physical_format`) since both fields live on the same
// edition record and the `volumes/brief` response that's already in hand
// doesn't carry either of them.
async function resolveEditionExtras(editionKey: string | undefined): Promise<{ workId: string | null; format: string | null }> {
  if (!editionKey) return { workId: null, format: null };
  try {
    const res = await fetchWithTimeout(`https://openlibrary.org${editionKey}.json`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) return { workId: null, format: null };
    const edition = (await res.json()) as { works?: { key: string }[]; physical_format?: string };
    const workKey = edition.works?.[0]?.key;
    return { workId: workKey ? workKey.replace("/works/", "") : null, format: edition.physical_format ?? null };
  } catch (err) {
    console.warn(`[openLibrary] Failed to resolve work id/format for edition ${editionKey}:`, err);
    return { workId: null, format: null };
  }
}

interface OpenLibraryRatingsData {
  summary?: { average?: number | null; count?: number };
}

export interface OpenLibraryRatings {
  average: number;
  count: number;
}

/**
 * Open Library ratings are keyed by work, not edition — a scanned book's
 * ratings are its work's ratings. `summary.average` comes back `null` (not
 * just absent) when nobody's rated the work yet, which is treated the same
 * as a zero count: no rating at all, rather than a real 0-star average.
 */
export async function getRatings(workId: string): Promise<OpenLibraryRatings | null> {
  const url = `https://openlibrary.org/works/${encodeURIComponent(workId)}/ratings.json`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Library request failed: ${res.status}`);

  const data = (await res.json()) as OpenLibraryRatingsData;
  const { average, count } = data.summary ?? {};
  if (!average || !count) return null;
  return { average, count };
}

export async function lookupByIsbn(isbn: string): Promise<OpenLibraryResult | null> {
  // The legacy `/api/books?bibkeys=...&jscmd=data` endpoint has been retired;
  // the Read API's `volumes/brief` endpoint returns the same `data` shape.
  const url = `https://openlibrary.org/api/volumes/brief/isbn/${encodeURIComponent(isbn)}.json`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Open Library request failed: ${res.status}`);

  const body = (await res.json()) as { records?: Record<string, { data?: OpenLibraryBookData }> };
  const record = body.records ? Object.values(body.records)[0] : undefined;
  const data = record?.data;
  if (!data) return null;

  const rawNotes = typeof data.notes === "string" ? data.notes : data.notes?.value ?? null;
  const notes = rawNotes ? stripOpenLibraryTrailer(rawNotes) : null;
  const { workId, format } = await resolveEditionExtras(data.key);
  const editionId = data.key ? data.key.replace("/books/", "") : null;

  return {
    title: data.title ?? "Unknown title",
    authors: (data.authors ?? []).flatMap((a) => {
      const id = extractAuthorId(a.url);
      return id ? [{ openLibraryId: id, name: a.name }] : [];
    }),
    subjects: (data.subjects ?? []).map((s) => s.name),
    coverUrl: data.cover?.large ?? data.cover?.medium ?? data.cover?.small ?? null,
    description: notes,
    workId,
    editionId,
    format,
  };
}
