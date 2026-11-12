import type { OpenLibraryList, OpenLibraryListSummary, OpenLibraryMember } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import { USER_AGENT } from "./openLibrary.js";

export class OpenLibraryAuthError extends Error {
  constructor(message = "Open Library rejected the credentials") {
    super(message);
    this.name = "OpenLibraryAuthError";
  }
}

export class OpenLibraryRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(`Open Library rate limit hit; retry in ${retryAfterSeconds}s`);
    this.name = "OpenLibraryRateLimitError";
  }
}

// Plain fetch, as hardcover.ts does: fetchWithTimeout replays POSTs on 5xx and turns one user's 429 into a host-wide cooldown. Never logs bodies, keys or cookies.
async function olFetch(path: string, init: RequestInit & { cookie?: string } = {}): Promise<Response> {
  const { cookie, headers, ...rest } = init;
  const res = await fetch(`https://openlibrary.org${path}`, {
    ...rest,
    signal: AbortSignal.timeout(10_000),
    headers: { "User-Agent": USER_AGENT, ...(cookie ? { Cookie: cookie } : {}), ...(headers as Record<string, string>) },
  });
  if (res.status === 429) throw new OpenLibraryRateLimitError(Number(res.headers.get("Retry-After")) || 60);
  if (res.status === 401 || res.status === 403) throw new OpenLibraryAuthError();
  return res;
}

export async function login(accessKey: string, secretKey: string): Promise<{ cookie: string; username: string }> {
  const res = await olFetch("/account/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access: accessKey, secret: secretKey }),
  });
  // Rejected keys come back as 400 invalid_s3keys.
  if (res.status === 400) throw new OpenLibraryAuthError();
  if (!res.ok) throw new Error(`Open Library login failed with ${res.status}`);
  // Only the session pair is kept; the other cookies (s3, pd, sfw) aren't needed.
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("session="))?.split(";")[0];
  if (!cookie) throw new OpenLibraryAuthError("Open Library returned no session");
  const value = decodeURIComponent(cookie.slice("session=".length)).replace(/^"|"$/g, "");
  const username = /^\/people\/([^,]+),/.exec(value)?.[1];
  if (!username) throw new OpenLibraryAuthError("Open Library returned an unreadable session");
  return { cookie, username };
}

const WEEK_MS = 1000 * 60 * 60 * 24 * 7;
const seedCache = new TtlCache<string | null>(WEEK_MS, 5000);
const memberCache = new TtlCache<OpenLibraryMember | null>(WEEK_MS, 5000);
const MAX_SEEDS = 2000;

const person = (username: string) => `/people/${encodeURIComponent(username)}`;
const listIdOf = (path: string) => /(OL\d+L)\/?$/.exec(path)?.[1];
const readJson = async <T>(res: Response): Promise<T> => {
  if (!res.ok) throw new Error(`Open Library request failed with ${res.status}`);
  return (await res.json()) as T;
};

export function seedFor(member: OpenLibraryMember): Promise<string | null> {
  if (member.type === "work") return Promise.resolve(`/works/${member.id}`);
  if (member.type === "author") return Promise.resolve(`/authors/${member.id}`);
  // The brief endpoint is read-only; /isbn/<isbn>.json would 302 to junk import records and may trigger imports.
  return seedCache.wrap(member.id, async () => {
    const res = await olFetch(`/api/volumes/brief/isbn/${encodeURIComponent(member.id)}.json`);
    if (res.status === 404) return null;
    const body = await readJson<{ records?: Record<string, unknown> }>(res);
    return Object.keys(Array.isArray(body) ? {} : (body.records ?? {}))[0] ?? null;
  });
}

export async function memberFor(seed: string): Promise<OpenLibraryMember | null> {
  const [, kind, id] = /^\/(works|authors|books)\/([^/]+)$/.exec(seed) ?? [];
  if (kind === "works") return { type: "work", id };
  if (kind === "authors") return { type: "author", id };
  if (kind !== "books") return null;
  return memberCache.wrap(seed, async () => {
    const res = await olFetch(`/books/${encodeURIComponent(id)}.json`);
    if (res.status === 404) return null;
    const ed = await readJson<{ isbn_13?: string[]; isbn_10?: string[] }>(res);
    const isbn = ed.isbn_13?.[0] ?? ed.isbn_10?.[0];
    return isbn ? { type: "book", id: isbn } : null;
  });
}

export async function myLists(username: string): Promise<OpenLibraryListSummary[]> {
  const body = await readJson<{ entries?: { url: string; name: string; seed_count: number }[] }>(
    await olFetch(`${person(username)}/lists.json`),
  );
  return (body.entries ?? []).flatMap((e) => {
    const id = listIdOf(e.url);
    return id ? [{ id, name: e.name, seedCount: e.seed_count }] : [];
  });
}

export async function getList(username: string, listId: string): Promise<OpenLibraryList | null> {
  const base = `${person(username)}/lists/${encodeURIComponent(listId)}`;
  const head = await olFetch(`${base}.json`);
  if (head.status === 404) return null;
  const info = await readJson<{ name: string; description?: string | null; seed_count: number }>(head);

  const entries: { url: string; title: string }[] = [];
  // shortcut: stops at 2,000 seeds; sync's seedCount guard refuses to prune past it. Page further if real lists get that big
  for (let next: string | undefined = `${base}/seeds.json`; next && entries.length < MAX_SEEDS; ) {
    const page: { links?: { next?: string }; entries?: { url: string; title: string }[] } = await readJson(await olFetch(next));
    entries.push(...(page.entries ?? []));
    next = page.links?.next;
  }
  entries.length = Math.min(entries.length, MAX_SEEDS);

  const members: (OpenLibraryMember | null)[] = new Array(entries.length).fill(null);
  let cursor = 0;
  const worker = async () => {
    for (let i = cursor++; i < entries.length; i = cursor++) members[i] = await memberFor(entries[i].url);
  };
  await Promise.all(Array.from({ length: 4 }, worker));

  return {
    name: info.name,
    description: info.description ?? "",
    seedCount: info.seed_count,
    seeds: entries.map((e, i) => ({ seed: e.url, title: e.title, member: members[i] })),
  };
}

export async function createList(username: string, input: { name: string; description: string }, cookie: string): Promise<string> {
  const res = await olFetch(`${person(username)}/lists.json`, {
    method: "POST",
    cookie,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, seeds: [] }),
  });
  const { key } = await readJson<{ key?: string }>(res);
  const id = key && listIdOf(key);
  if (!id) throw new Error("Open Library did not return the new list's id");
  return id;
}

export async function updateSeeds(
  username: string,
  listId: string,
  change: { add: string[]; remove: string[] },
  cookie: string,
): Promise<void> {
  const res = await olFetch(`${person(username)}/lists/${encodeURIComponent(listId)}/seeds.json`, {
    method: "POST",
    cookie,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ add: change.add.map((key) => ({ key })), remove: change.remove }),
  });
  if (!res.ok) throw new Error(`Open Library seed update failed with ${res.status}`);
}
