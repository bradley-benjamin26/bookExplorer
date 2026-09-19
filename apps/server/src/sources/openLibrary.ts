import type { AuthorRef } from "@book-explorer/shared";
import { fetchWithTimeout } from "../httpClient.js";

export const USER_AGENT = "BookExplorer/0.1 (contact: bbradle1@umd.edu)";

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
}

export interface OpenLibraryAuthor {
  name: string;
  bio: string | null;
  birthDate: string | null;
  deathDate: string | null;
  wikidataId: string | null;
}

export async function getAuthor(openLibraryId: string): Promise<OpenLibraryAuthor | null> {
  const url = `https://openlibrary.org/authors/${encodeURIComponent(openLibraryId)}.json`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Library request failed: ${res.status}`);

  const data = (await res.json()) as OpenLibraryAuthorData;
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

export interface OpenLibraryWork {
  title: string;
  authors: AuthorRef[];
  coverUrl: string | null;
  description: string | null;
  subjects: string[];
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
  const authors = await Promise.all(
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
  );

  const description = typeof data.description === "string" ? data.description : data.description?.value ?? null;
  const coverId = data.covers?.find((c) => c > 0);

  return {
    title: data.title ?? "Unknown title",
    authors,
    coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null,
    description,
    subjects: data.subjects ?? [],
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

// The `volumes/brief` response below doesn't include a work reference at
// all (verified against the live API — it's simply not one of the fields
// it returns), so getting one costs a second request to the edition record
// it does point to. Failure here is non-fatal: the rest of the book's data
// is still useful without a work id, it just can't link into the graph.
async function resolveWorkId(editionKey: string | undefined): Promise<string | null> {
  if (!editionKey) return null;
  try {
    const res = await fetchWithTimeout(`https://openlibrary.org${editionKey}.json`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) return null;
    const edition = (await res.json()) as { works?: { key: string }[] };
    const workKey = edition.works?.[0]?.key;
    return workKey ? workKey.replace("/works/", "") : null;
  } catch (err) {
    console.warn(`[openLibrary] Failed to resolve work id for edition ${editionKey}:`, err);
    return null;
  }
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

  const notes = typeof data.notes === "string" ? data.notes : data.notes?.value ?? null;
  const workId = await resolveWorkId(data.key);

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
  };
}
