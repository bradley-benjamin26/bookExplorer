import type { AuthorRef } from "@book-explorer/shared";

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
}

function extractAuthorId(url: string): string {
  const match = url.match(/\/authors\/(OL\w+A)/);
  if (!match) throw new Error(`Could not parse author id from ${url}`);
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
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
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
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
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
      const author = await getAuthor(id).catch(() => null);
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
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Library request failed: ${res.status}`);

  const data = (await res.json()) as OpenLibrarySubjectData;
  if (!data.works) return null;

  return {
    name: data.name ?? slug,
    workCount: data.work_count ?? 0,
    works: data.works.map((w) => ({
      workId: w.key.replace("/works/", ""),
      title: w.title,
      authors: (w.authors ?? []).map((a) => ({ openLibraryId: a.key.replace("/authors/", ""), name: a.name })),
      coverUrl: w.cover_id ? `https://covers.openlibrary.org/b/id/${w.cover_id}-M.jpg` : null,
    })),
  };
}

export async function lookupByIsbn(isbn: string): Promise<OpenLibraryResult | null> {
  // The legacy `/api/books?bibkeys=...&jscmd=data` endpoint has been retired;
  // the Read API's `volumes/brief` endpoint returns the same `data` shape.
  const url = `https://openlibrary.org/api/volumes/brief/isbn/${encodeURIComponent(isbn)}.json`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Open Library request failed: ${res.status}`);

  const body = (await res.json()) as { records?: Record<string, { data?: OpenLibraryBookData }> };
  const record = body.records ? Object.values(body.records)[0] : undefined;
  const data = record?.data;
  if (!data) return null;

  const notes = typeof data.notes === "string" ? data.notes : data.notes?.value ?? null;

  return {
    title: data.title ?? "Unknown title",
    authors: (data.authors ?? []).map((a) => ({ openLibraryId: extractAuthorId(a.url), name: a.name })),
    subjects: (data.subjects ?? []).map((s) => s.name),
    coverUrl: data.cover?.large ?? data.cover?.medium ?? data.cover?.small ?? null,
    description: notes,
  };
}
