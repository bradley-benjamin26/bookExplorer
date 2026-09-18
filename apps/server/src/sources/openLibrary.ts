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
