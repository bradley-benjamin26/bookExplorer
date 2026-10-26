import { normalizeTitle, slugifySubject, type Book, type Graph, type Subject, type Work, type WorkRef } from "@book-explorer/shared";
import { toAlternateIsbn } from "./isbn";
import type { Snapshot } from "./storage/snapshot";

// Bounds on the candidate fetch: one /api/subjects call per top subject and one
// /api/graph/author call per top author, FETCH_CONCURRENCY at a time.
export const TOP_SUBJECTS = 5;
export const TOP_AUTHORS = 3;
export const FETCH_CONCURRENCY = 3;
export const MAX_RECOMMENDATIONS = 10;

// Each author link counts like a shared subject held by every saved book (ln 2).
const AUTHOR_WEIGHT = Math.LN2;
// At most +-0.25, under any single shared subject or author link (>= ln 2), so a
// rating only reorders candidates whose other evidence is close.
const RATING_WEIGHT = 0.25;

/** A saved author (or the author of a saved book), and the saved thing to credit for it. */
export interface AuthorSeed {
  id: string;
  name: string;
  seedTitle: string;
}

export interface TasteProfile {
  /** The most common subject/genre slugs across saved books, with their idf weight and the saved books that carry them. */
  subjects: { slug: string; label: string; weight: number; seedTitles: string[] }[];
  authors: AuthorSeed[];
  /** Work ids already saved (as a work, or as a book's work), never recommended. */
  excludedWorkIds: Set<string>;
  /** Normalised titles of saved books and works, for saved books with no work id. */
  excludedTitles: Set<string>;
}

export interface Recommendation {
  work: WorkRef;
  score: number;
  /** The single strongest thing it shares with the library; recommendations are grouped by it. */
  reason: Reason;
  /** Everything it has in common with that library, for "shares: ...". */
  shares: string[];
}

export interface Reason {
  kind: "subject" | "author" | "influence";
  /** The subject label, or the author's name. */
  label: string;
  /** The saved items that carry it. */
  seedTitles: string[];
}

/** One group per primary reason; the same key for the same reason on every run. */
export const reasonKey = (r: Reason) => `${r.kind}:${r.label}`;

export function reasonHeading({ kind, label, seedTitles }: Reason): string {
  if (kind === "author") return `More by ${label}`;
  if (kind === "influence") return `Connected to ${label}`; // influence edges run either way
  return `Because you like ${label}${seedTitles.length > 1 ? ` (${seedTitles.length} saved)` : ""}`;
}

/**
 * Author seeds (saved authors, plus the authors of saved books and works) and the slugs of
 * public subjects, both read only from cached API details. A record's own subjects are never
 * public: they may be the user's tags. Items with no cached detail contribute nothing.
 * Details are looked up by query id (the saved ISBN or its other form, the saved work id), since the
 * payload can carry a redirected work id or the other ISBN form.
 */
export function seedsFromCache(snapshot: Snapshot, cachedBook: (isbn: string) => Book | undefined, cachedWork: (workId: string) => Work | undefined) {
  const seeds: AuthorSeed[] = snapshot.items
    .filter((i) => !i.deletedAt && i.type === "author")
    .map((i) => ({ id: i.id, name: i.title, seedTitle: i.title }));
  const publicSlugs = new Set<string>();
  const take = (cached: Book | Work | undefined, title: string) => {
    if (!cached) return;
    for (const a of cached.authors) seeds.push({ id: a.openLibraryId, name: a.name, seedTitle: title });
    for (const t of [...cached.subjects, ...cached.genres]) publicSlugs.add(slugifySubject(t.label));
  };
  for (const r of snapshot.books) {
    const alternate = toAlternateIsbn(r.isbn);
    if (!r.deletedAt) take(cachedBook(r.isbn) ?? (alternate ? cachedBook(alternate) : undefined), r.title);
  }
  for (const r of snapshot.works) if (!r.deletedAt) take(cachedWork(r.openLibraryWorkId), r.title);
  return { seeds, publicSlugs };
}

/** A subject must be shared by this many saved items to count, so one-off tags (e.g. "baggers") don't head a group. */
export const MIN_SHARED_SUBJECT = 2;

/**
 * The live parts of a snapshot reduced to what scoring needs. Author seeds come from the caller, which can resolve ids.
 * Only slugs in `publicSlugs` (terms an API response gave) are used, since a saved
 * book's subjects also hold the user's own tags, which must never be sent anywhere.
 */
export function buildTasteProfile(snapshot: Snapshot, authors: AuthorSeed[], publicSlugs: Set<string>): TasteProfile {
  // Saved works seed subjects like saved books do.
  const books = [...snapshot.books, ...snapshot.works].filter((b) => !b.deletedAt);
  const terms = new Map<string, { label: string; seedTitles: string[] }>();
  for (const book of books) {
    // A term listed as both subject and genre counts once per book.
    const slugs = new Map([...book.subjects, ...book.genres].map((label) => [slugifySubject(label), label]));
    for (const [slug, label] of slugs) {
      if (!publicSlugs.has(slug)) continue;
      const term = terms.get(slug) ?? { label, seedTitles: [] };
      term.seedTitles.push(book.title);
      terms.set(slug, term);
    }
  }
  const subjects = [...terms]
    .filter(([, t]) => t.seedTitles.length >= MIN_SHARED_SUBJECT)
    .map(([slug, t]) => ({ slug, label: t.label, seedTitles: t.seedTitles.sort(), weight: Math.log(1 + books.length / t.seedTitles.length) }))
    .sort((a, b) => b.seedTitles.length - a.seedTitles.length || cmp(a.slug, b.slug))
    .slice(0, TOP_SUBJECTS);

  const excludedWorkIds = new Set<string>();
  for (const b of books) if (b.openLibraryWorkId) excludedWorkIds.add(b.openLibraryWorkId);
  for (const i of snapshot.items) if (!i.deletedAt && i.type === "work") excludedWorkIds.add(i.id);
  const excludedTitles = new Set([...books.map((b) => b.title), ...snapshot.items.filter((i) => !i.deletedAt && i.type !== "author").map((i) => i.title)].map(normalizeTitle));

  // The authors behind the most saved items, each credited to its first saved title.
  const byId = new Map<string, AuthorSeed[]>();
  for (const a of authors) byId.set(a.id, [...(byId.get(a.id) ?? []), a]);
  const topAuthors = [...byId.values()]
    .sort((a, b) => b.length - a.length || cmp(a[0].id, b[0].id))
    .slice(0, TOP_AUTHORS)
    .map((seeds) => seeds.sort((a, b) => cmp(a.seedTitle, b.seedTitle))[0]);
  return { subjects, authors: topAuthors, excludedWorkIds, excludedTitles };
}

interface Evidence {
  work: WorkRef;
  reasons: (Reason & { share: string; weight: number })[];
}

/**
 * Ranks candidate works from the fetched subject listings and author graphs:
 * the idf weight of every shared subject, plus AUTHOR_WEIGHT per author link
 * (written by, or an influence of, a saved author), plus a small boost from
 * any already-known rating (average out of 5). Pure and deterministic: ties
 * break on title, then work id.
 */
export function rankRecommendations(
  profile: TasteProfile,
  subjectResults: Map<string, Subject>,
  authorGraphs: Map<string, Graph>,
  ratings: Map<string, number> = new Map(),
  limit = MAX_RECOMMENDATIONS
): Recommendation[] {
  const candidates = new Map<string, Evidence>();
  const add = (work: WorkRef, kind: Reason["kind"], label: string, share: string, weight: number, seedTitles: string[]) => {
    if (profile.excludedWorkIds.has(work.openLibraryWorkId) || profile.excludedTitles.has(normalizeTitle(work.title))) return;
    const c = candidates.get(work.openLibraryWorkId) ?? { work, reasons: [] };
    // Subject listings carry covers and author ids that graph nodes don't; keep the richer ref.
    if (!c.work.coverUrl && work.coverUrl) c.work = work;
    if (!c.reasons.some((r) => r.share === share)) c.reasons.push({ kind, label, share, weight, seedTitles });
    candidates.set(work.openLibraryWorkId, c);
  };

  for (const s of profile.subjects) {
    for (const work of subjectResults.get(s.slug)?.books ?? []) add(work, "subject", s.label, s.label, s.weight, s.seedTitles);
  }

  // Authors linked by influence to a saved author, so their works found above count too.
  const influences = new Map<string, AuthorSeed>();
  for (const seed of profile.authors) {
    const graph = authorGraphs.get(seed.id);
    if (!graph) continue;
    const center = `author:${seed.id}`;
    const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
    for (const e of graph.edges) {
      const otherId = e.source === center ? e.target : e.target === center ? e.source : null;
      const other = otherId ? nodes.get(otherId) : undefined;
      // "qid:" nodes have no Open Library id, so nothing to open or match.
      if (!other || !other.navigable || other.id.includes(":qid:")) continue;
      const olid = other.id.slice(other.id.indexOf(":") + 1);
      if (e.relation === "influencedBy" && other.type === "author") influences.set(olid, seed);
      else if (other.type === "work") {
        const influence = e.relation === "influencedBy";
        const work = { openLibraryWorkId: olid, title: other.label, authors: influence ? [] : [{ openLibraryId: seed.id, name: seed.name }], coverUrl: null };
        add(work, influence ? "influence" : "author", seed.name, influence ? `influence link to ${seed.name}` : `author ${seed.name}`, AUTHOR_WEIGHT, [seed.seedTitle]);
      }
    }
  }
  const seedsById = new Map(profile.authors.map((a) => [a.id, a]));
  for (const c of candidates.values()) {
    for (const a of c.work.authors) {
      const seed = seedsById.get(a.openLibraryId);
      if (seed) add(c.work, "author", seed.name, `author ${seed.name}`, AUTHOR_WEIGHT, [seed.seedTitle]);
      const influenced = influences.get(a.openLibraryId);
      if (influenced) add(c.work, "influence", influenced.name, `influence link to ${influenced.name}`, AUTHOR_WEIGHT, [influenced.seedTitle]);
    }
  }

  return [...candidates.values()]
    .map(({ work, reasons }) => {
      const rating = ratings.get(work.openLibraryWorkId);
      const boost = rating === undefined ? 0 : RATING_WEIGHT * Math.max(-1, Math.min(1, (rating - 3) / 2));
      return { work, score: reasons.reduce((sum, r) => sum + r.weight, 0) + boost, ...explain(reasons) };
    })
    .sort((a, b) => b.score - a.score || cmp(a.work.title, b.work.title) || cmp(a.work.openLibraryWorkId, b.work.openLibraryWorkId))
    .slice(0, limit);
}

/** The primary reason is the heaviest evidence; ties go to more saved items sharing it, then the label. */
export function explain(reasons: Evidence["reasons"]): { reason: Reason; shares: string[] } {
  const [{ kind, label, seedTitles }] = [...reasons].sort((a, b) => b.weight - a.weight || b.seedTitles.length - a.seedTitles.length || cmp(a.label, b.label));
  return { reason: { kind, label, seedTitles }, shares: reasons.map((r) => r.share) };
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Runs `fn` over `items` with at most `limit` in flight, keeping results in input order. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
