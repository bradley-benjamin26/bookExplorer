import type { AuthorRef } from "@book-explorer/shared";
import { orderEditions } from "../editionOrder.js";
import { fetchWithTimeout, UpstreamUnavailableError } from "../httpClient.js";
import { TtlCache } from "../cache.js";

// Upstream APIs (Open Library asks for this) use the contact address to reach us instead of blocking us.
const CONTACT_EMAIL = process.env.USER_EMAIL?.trim();
export const USER_AGENT = CONTACT_EMAIL ? `BookExplorer/0.1 (contact: ${CONTACT_EMAIL})` : "BookExplorer/0.1";

// Open Library appends auto-generated metadata ("Also contained in:" link lists) after a "----------"
// divider; the app renders plain text, so everything from the divider on is dropped.
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

// Returns null on a malformed entry: one odd author record shouldn't fail an otherwise good response.
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

// Merged author ids leave a redirect stub at the old id with no `name`, which would show the raw id
// as the name. `depth` guards against a redirect loop.
async function fetchAuthor(openLibraryId: string, depth = 0): Promise<OpenLibraryAuthor | null> {
  const url = `https://openlibrary.org/authors/${encodeURIComponent(openLibraryId)}.json`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Library request failed: ${res.status}`);

  const data = (await res.json()) as OpenLibraryAuthorData;

  if (data.type?.key === "/type/redirect" && data.location && depth < 3) {
    return fetchAuthor(data.location.replace("/authors/", ""), depth + 1);
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

// Works name authors only by id, so expanding many works would re-fetch the same author record.
const authorRecordCache = new TtlCache<OpenLibraryAuthor | null>(1000 * 60 * 60 * 24, 2000, "olAuthor");

export function getAuthor(openLibraryId: string): Promise<OpenLibraryAuthor | null> {
  return authorRecordCache.wrap(openLibraryId, () => fetchAuthor(openLibraryId));
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
  // Open Library's free-text physical form ("Paperback", "eAudiobook", ...); shown as-is, not normalized.
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
  // Every edition ISBN in Open Library's listing order; `isbn` is the first. Exposed so callers can try
  // more than one, since the first-listed edition can be a foreign translation.
  isbnCandidates: string[];
  // Editions with enough to show (cover, ISBN, format, publisher or date); Open Library's listing has many bare stubs.
  editions: OpenLibraryEdition[];
}

interface OpenLibraryEditionsData {
  entries?: {
    key?: string;
    title?: string;
    isbn_13?: string[];
    isbn_10?: string[];
    languages?: { key?: string }[];
    physical_format?: string;
    publishers?: string[];
    publish_date?: string;
    covers?: number[];
  }[];
}

// A work is edition-agnostic (no ISBN of its own). This collects every edition's ISBN and display
// metadata, preferring ISBN-13, so work pages reached without scanning can offer ISBN-based links
// and an Editions section.
// shortcut: only Open Library's first 50 editions are listed, ranked and used as ISBN candidates; fetch further pages if popular works show odd editions.
async function getWorkEditions(workId: string): Promise<{ editions: OpenLibraryEdition[]; englishTitles: string[]; englishCoverId: number | null }> {
  const url = `https://openlibrary.org/works/${encodeURIComponent(workId)}/editions.json?limit=50`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Open Library request failed: ${res.status}`);

  const data = (await res.json()) as OpenLibraryEditionsData;
  const editions: (OpenLibraryEdition & { nonEnglish: boolean; english: boolean; coverId: number | undefined })[] = [];
  const englishTitles: string[] = [];
  for (const entry of data.entries ?? []) {
    if (entry.title && entry.languages?.some((l) => l.key === "/languages/eng")) englishTitles.push(entry.title);
    const coverId = entry.covers?.find((c) => c > 0);
    const edition: OpenLibraryEdition = {
      openLibraryEditionId: (entry.key ?? "").replace("/books/", ""),
      isbn: entry.isbn_13?.[0] ?? entry.isbn_10?.[0] ?? null,
      format: entry.physical_format ?? null,
      publisher: entry.publishers?.[0] ?? null,
      publishDate: entry.publish_date ?? null,
      coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null,
    };
    // Skip stubs with nothing to show.
    if (!edition.isbn && !edition.coverUrl && !edition.format && !edition.publisher && !edition.publishDate) {
      continue;
    }
    const nonEnglish = (entry.languages ?? []).some((l) => l.key && l.key !== "/languages/eng");
    const english = (entry.languages ?? []).some((l) => l.key === "/languages/eng");
    editions.push({ ...edition, nonEnglish, english, coverId });
  }

  // Labelled English first, then unlabeled, then non-English; within a tier newest, covers as a small boost; non-English are demoted,
  // not dropped. Open Library's listing order has no language preference.
  const ordered = orderEditions(editions);

  // Only editions labelled English count: unlabeled ones might be translations.
  const englishCoverId = ordered.find((e) => e.english && e.coverId)?.coverId ?? null;

  // Dedupe by ISBN only: two records sharing an ISBN are one printing, but different ISBNs are kept even
  // when publisher/format/year match. `null` ISBNs are never deduped against each other.
  const seenIsbns = new Set<string>();
  const deduped = ordered.filter((edition) => {
    if (!edition.isbn) return true;
    if (seenIsbns.has(edition.isbn)) return false;
    seenIsbns.add(edition.isbn);
    return true;
  });

  return { editions: deduped.map(({ nonEnglish, english, coverId, ...edition }) => edition), englishTitles, englishCoverId };
}

// A work's title is often its original-language one. When no English edition carries it, the English
// editions' most common title is shown instead; a title an English edition does carry is kept.
function englishTitle(workTitle: string, englishTitles: string[]): string {
  if (englishTitles.length === 0 || englishTitles.some((t) => t.toLowerCase() === workTitle.toLowerCase())) return workTitle;
  const counts = new Map<string, { title: string; n: number }>();
  for (const title of englishTitles) {
    const entry = counts.get(title.toLowerCase()) ?? { title, n: 0 };
    entry.n++;
    counts.set(title.toLowerCase(), entry);
  }
  return [...counts.values()].reduce((best, c) => (c.n > best.n ? c : best)).title;
}

export async function getWork(workId: string, { editions: withEditions = true }: { editions?: boolean } = {}): Promise<OpenLibraryWork | null> {
  const url = `https://openlibrary.org/works/${encodeURIComponent(workId)}.json`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Library request failed: ${res.status}`);

  const data = (await res.json()) as OpenLibraryWorkData;

  const authorIds = (data.authors ?? [])
    .map((a) => a.author?.key)
    .filter((key): key is string => !!key)
    .map((key) => key.replace("/authors/", ""));

  // Work records only reference authors by id; names are resolved per author.
  const [authors, { editions, englishTitles, englishCoverId }] = await Promise.all([
    Promise.all(
      authorIds.map(async (id) => {
        const author = await getAuthor(id).catch((err) => {
          if (err instanceof UpstreamUnavailableError) throw err;
          console.warn(`[openLibrary] Failed to resolve author name for ${id}:`, err);
          return null;
        });
        // The raw id as a name is deliberately visible so a failed resolution looks wrong.
        return { openLibraryId: id, name: author?.name ?? id };
      })
    ),
    // Best-effort: a failure only loses extra links and the editions list.
    withEditions
      ? getWorkEditions(workId).catch((err) => {
          if (err instanceof UpstreamUnavailableError) throw err;
          console.warn(`[openLibrary] Failed to resolve editions for work ${workId}:`, err);
          return { editions: [] as OpenLibraryEdition[], englishTitles: [], englishCoverId: null };
        })
      : { editions: [] as OpenLibraryEdition[], englishTitles: [], englishCoverId: null },
  ]);

  const isbnCandidates = [...new Set(editions.map((e) => e.isbn).filter((isbn): isbn is string => !!isbn))];

  const rawDescription = typeof data.description === "string" ? data.description : data.description?.value ?? null;
  const description = rawDescription ? stripOpenLibraryTrailer(rawDescription) : null;
  // A work's first cover is often a translation's; an English edition's cover wins.
  const coverId = englishCoverId ?? data.covers?.find((c) => c > 0);

  return {
    title: data.title ? englishTitle(data.title, englishTitles) : "Unknown title",
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

/** Free-text title/author search via Open Library, the entry point for users without an ISBN; getWorkDetail does the enrichment. */
export async function searchWorks(query: string, limit = 20, sort?: string): Promise<OpenLibrarySearchResult[]> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(
    query
  )}&fields=key,title,author_name,author_key,cover_i&limit=${limit}${sort ? `&sort=${sort}` : ""}`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Open Library search request failed: ${res.status}`);

  const data = (await res.json()) as {
    docs?: { key?: string; title?: string; author_name?: string[]; author_key?: string[]; cover_i?: number }[];
  };

  // Skips a result with no work key rather than throwing, as in extractAuthorId.
  return (data.docs ?? []).flatMap((doc) => {
    if (!doc.key || !doc.title) return [];
    const authorNames = doc.author_name ?? [];
    const authorKeys = doc.author_key ?? [];
    return [
      {
        workId: doc.key.replace("/works/", ""),
        title: doc.title,
        // author_name/author_key are parallel arrays of not-guaranteed equal length; zip only as far as both extend.
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
    // Skips an entry with no key rather than throwing, as in extractAuthorId.
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
  authors: AuthorRef[];
  coverUrl: string | null;
}

/**
 * An author's full bibliography from Open Library; Wikidata's P800 notable works are far sparser.
 * Uses the search API because its `language` field filters out translations, which are cataloged as
 * separate works with unrelated titles. Works with no language recorded are kept (best-effort filter).
 */
export async function getAuthorWorks(openLibraryId: string, limit = 15): Promise<OpenLibraryAuthorWork[]> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(
    `author_key:${openLibraryId}`
  )}&fields=title,key,language,cover_i,author_name,author_key&limit=${Math.max(limit * 2, 40)}`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Open Library request failed: ${res.status}`);

  const data = (await res.json()) as { docs?: { key: string; title: string; language?: string[]; cover_i?: number; author_name?: string[]; author_key?: string[] }[] };
  return (data.docs ?? [])
    .filter((d) => d.key && d.title && (!d.language || d.language.includes("eng")))
    .slice(0, limit)
    .map((d) => ({
      workId: d.key.replace("/works/", ""),
      title: d.title,
      // Same parallel-array zip as searchWorks.
      authors: (d.author_name ?? []).slice(0, (d.author_key ?? []).length).map((name, i) => ({ openLibraryId: d.author_key![i], name })),
      coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
    }));
}

/** Best-effort match of a title plus author name to an Open Library work (Wikidata's P648 can be a stale, merged id). */
export async function findWork(title: string, authorName: string): Promise<{ workId: string; coverUrl: string | null } | null> {
  const params = new URLSearchParams({ title, author: authorName, fields: "key,cover_i", limit: "1" });
  const res = await fetchWithTimeout(`https://openlibrary.org/search.json?${params}`, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Open Library search request failed: ${res.status}`);
  const doc = ((await res.json()) as { docs?: { key?: string; cover_i?: number }[] }).docs?.[0];
  if (!doc?.key) return null;
  return { workId: doc.key.replace("/works/", ""), coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null };
}

interface AuthorSearchResult {
  docs?: { key: string; name: string }[];
}

/** Best-effort match of a plain name (e.g. a Wikidata pen name) to an Open Library author; takes the top-ranked hit. */
export async function searchAuthors(name: string, limit: number): Promise<{ openLibraryId: string; name: string }[]> {
  const url = `https://openlibrary.org/search/authors.json?q=${encodeURIComponent(name)}&limit=${limit}`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Open Library request failed: ${res.status}`);

  const data = (await res.json()) as AuthorSearchResult;
  return (data.docs ?? []).map((doc) => ({ openLibraryId: doc.key, name: doc.name }));
}

export async function searchAuthorByName(name: string): Promise<{ openLibraryId: string; name: string } | null> {
  return (await searchAuthors(name, 1))[0] ?? null;
}

// volumes/brief has no work reference, so one extra request to the edition record gets the work id
// and `physical_format` together. Non-fatal: the book is still useful without a work id.
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
    if (err instanceof UpstreamUnavailableError) throw err;
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

/** Ratings are keyed by work, not edition. `summary.average` is `null` when nobody has rated, treated as no rating rather than 0 stars. */
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
  // The legacy /api/books?bibkeys endpoint is retired; Read API volumes/brief returns the same `data` shape.
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
