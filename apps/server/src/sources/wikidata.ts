import type { AuthorRelation, SubjectConcept } from "@book-explorer/shared";
import { fetchWithTimeout } from "../httpClient.js";
import { USER_AGENT } from "./openLibrary.js";

interface WbSearchResult {
  search: { id: string; description?: string }[];
}

const AUTHOR_KEYWORDS = ["writer", "author", "novelist", "poet", "playwright", "journalist"];

/** Falls back to a Wikidata name search when Open Library has no `remote_ids.wikidata`. */
export async function searchAuthorQid(name: string): Promise<string | null> {
  const body = await wbSearchEntities(name, 5);
  const match = body.search.find((r) => AUTHOR_KEYWORDS.some((kw) => r.description?.toLowerCase().includes(kw)));
  return (match ?? body.search[0])?.id ?? null;
}

// Open Library subject strings are topics/genres, not named works, so results
// that are clearly about a specific film/book/episode/etc of the same name
// are rejected rather than guessed at — a wrong disambiguation would surface
// nonsense "related concepts", which is worse than surfacing none.
const CONCEPT_REJECT_KEYWORDS = [
  "film",
  "album",
  "episode",
  "song",
  "tv series",
  "video game",
  " by ",
  "edition of",
  "painting",
  "thesis",
  "disambiguation",
];

/** Best-effort match of a (often messy) Open Library subject string to a Wikidata concept. */
export async function searchConceptQid(name: string): Promise<string | null> {
  const body = await wbSearchEntities(name, 8);
  const match = body.search.find(
    (r) => !CONCEPT_REJECT_KEYWORDS.some((kw) => r.description?.toLowerCase().includes(kw))
  );
  return match?.id ?? null;
}

// Wikidata's search descriptions for literary works are reliably shaped
// like "<year> novel by <author>" (verified live: "1813 novel by Jane
// Austen", "book by George Selden") — so unlike the subject-concept search
// above, a positive signal is available here: requiring both a work-type
// word AND the author's own last name in the description is a much
// stronger match than keyword-rejection alone, since a title like "1984"
// otherwise collides with unrelated films, albums, and even the plain
// number.
const WORK_TYPE_KEYWORDS = ["novel", "book", "novella", "short story", "poem", "play", "memoir"];
const WORK_REJECT_KEYWORDS = ["film", "television", "tv series", "album", "video game", "edition of", "edited by"];

/** Best-effort match of a book's title + author to the Wikidata item for the literary work itself (not a specific edition, film adaptation, etc). */
export async function searchWorkQid(title: string, authorName: string): Promise<string | null> {
  const body = await wbSearchEntities(title, 8);
  const authorLastName = authorName.trim().split(/\s+/).pop()?.toLowerCase();
  if (!authorLastName) return null;

  const match = body.search.find((r) => {
    const desc = r.description?.toLowerCase() ?? "";
    if (WORK_REJECT_KEYWORDS.some((kw) => desc.includes(kw))) return false;
    return WORK_TYPE_KEYWORDS.some((kw) => desc.includes(kw)) && desc.includes(authorLastName);
  });
  return match?.id ?? null;
}

async function wbSearchEntities(name: string, limit: number): Promise<WbSearchResult> {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
    name
  )}&language=en&format=json&type=item&limit=${limit}`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Wikidata search failed: ${res.status}`);
  return res.json();
}

// Cheap fail-fast validation before spending a network round trip on an id
// that can't possibly resolve to anything — Open Library's `remote_ids.wikidata`
// field is free-text on a wiki anyone can edit, so it isn't trustworthy input.
export function isValidQid(qid: string): boolean {
  return /^Q[1-9]\d*$/.test(qid);
}

interface WbStatement {
  rank?: string;
  mainsnak?: { datavalue?: { value: unknown } };
}

interface WbEntity {
  claims?: Record<string, WbStatement[]>;
  labels?: Record<string, { value: string }>;
}

/**
 * Batched entity fetch via the MediaWiki Action API (`wbgetentities`) —
 * chunked into groups of 50, the API's per-request cap. This and
 * `searchReverseStatementQids` below replace what used to be SPARQL queries
 * against query.wikidata.org: confirmed live that the equivalent SPARQL
 * reverse-lookup query took ~11.5s versus ~0.3s for a batched entity fetch,
 * a ~25x difference for the same, correct result.
 */
async function wbGetEntities(ids: string[], props: string, languages?: string): Promise<Record<string, WbEntity>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return {};

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 50) chunks.push(unique.slice(i, i + 50));

  const chunkResults = await Promise.all(
    chunks.map(async (chunk) => {
      const params = new URLSearchParams({ action: "wbgetentities", ids: chunk.join("|"), props, format: "json" });
      if (languages) params.set("languages", languages);
      const res = await fetchWithTimeout(`https://www.wikidata.org/w/api.php?${params}`, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (!res.ok) throw new Error(`Wikidata entity lookup failed: ${res.status}`);
      const body = (await res.json()) as { entities?: Record<string, WbEntity> };
      return body.entities ?? {};
    })
  );
  return Object.assign({}, ...chunkResults);
}

// Excludes "deprecated"-rank statements, matching what SPARQL's `wdt:`
// shortcut (used before this rewrite) silently did — a deprecated statement
// is Wikidata's own way of marking a value as known-wrong. Unlike `wdt:`,
// this keeps *all* non-deprecated ranks (both "preferred" and "normal")
// rather than only the single best-ranked value per property, which turned
// out to matter: George Selden's real pseudonym "Terry Andrews" is
// normal-rank while his own name is marked preferred on the same property,
// and `wdt:` alone silently dropped it.
function claimValues(entity: WbEntity | undefined, property: string): unknown[] {
  return (entity?.claims?.[property] ?? [])
    .filter((s) => s.rank !== "deprecated")
    .map((s) => s.mainsnak?.datavalue?.value);
}

function claimItemIds(entity: WbEntity | undefined, property: string): string[] {
  return claimValues(entity, property)
    .filter((v): v is { id: string } => typeof v === "object" && v !== null && "id" in v)
    .map((v) => v.id);
}

function claimStrings(entity: WbEntity | undefined, property: string): string[] {
  return claimValues(entity, property).filter((v): v is string => typeof v === "string");
}

/**
 * Wikidata's search index (Elasticsearch-backed, the same one behind
 * Special:Search) supports a `haswbstatement:P123=Q456` filter — this is
 * what stands in for SPARQL's reverse-triple pattern (`?item wdt:P123
 * wd:Q456`), letting "who was influenced by this author" or "what's
 * narrower than this concept" be found without a graph query at all.
 */
async function searchReverseStatementQids(property: string, qid: string, limit = 50): Promise<string[]> {
  const url = `https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    `haswbstatement:${property}=${qid}`
  )}&srlimit=${limit}&format=json`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Wikidata search failed: ${res.status}`);
  const body = (await res.json()) as { query?: { search?: { title: string }[] } };
  return (body.query?.search ?? []).map((r) => r.title).filter(isValidQid);
}

interface ResolvedItem {
  label: string;
  openLibraryId: string | null;
}

/**
 * Resolves a batch of QIDs to a display label + Open Library id (P648),
 * with a fallback for items that have no English label at all — e.g.
 * several of a Spanish author's works only have Spanish labels. `wbgetentities`
 * has no built-in "any available language" fallback (verified live:
 * `languagefallback=1` does not reach across unrelated languages), so items
 * missing an English label get two more small batched lookups: their own
 * `P407` ("language of work or name") to find which language item that is,
 * then that language item's `P424` ("Wikimedia language code") to know
 * which code to request the actual label in. Both extra round trips are
 * skipped entirely when nothing is missing an English label, which is the
 * common case.
 *
 * An item that still has no label after all of that (confirmed live: this
 * does happen — some Wikidata items are little more than a bare identifier
 * with claims but no label in any language yet) is left out of the returned
 * map entirely, rather than falling back to showing its raw "Q12345" id as
 * if that were a name — every caller here already treats a missing map
 * entry as "skip this one", so no caller-side change is needed to make that
 * item simply not appear in the UI.
 */
async function resolveItems(qids: string[]): Promise<Map<string, ResolvedItem>> {
  const unique = [...new Set(qids)];
  if (unique.length === 0) return new Map();

  const entities = await wbGetEntities(unique, "labels|claims", "en");

  // `unresolved` tracks qids with no label yet found in any language so far
  // — a qid is only ever in at most one of `resolved` / `unresolved` at a
  // time, and moves from the latter to the former as soon as a real label
  // for it turns up.
  const resolved = new Map<string, ResolvedItem>();
  const unresolved = new Map<string, { openLibraryId: string | null }>();
  for (const qid of unique) {
    const entity = entities[qid];
    const openLibraryId = claimStrings(entity, "P648")[0] ?? null;
    const enLabel = entity?.labels?.en?.value;
    if (enLabel) {
      resolved.set(qid, { label: enLabel, openLibraryId });
    } else {
      unresolved.set(qid, { openLibraryId });
    }
  }
  if (unresolved.size === 0) return resolved;

  const languageQidByItem = new Map<string, string>();
  for (const qid of unresolved.keys()) {
    const langQid = claimItemIds(entities[qid], "P407")[0];
    if (langQid) languageQidByItem.set(qid, langQid);
  }
  if (languageQidByItem.size === 0) return resolved;

  const languageEntities = await wbGetEntities([...new Set(languageQidByItem.values())], "claims");
  const codeByItem = new Map<string, string>();
  for (const [qid, langQid] of languageQidByItem) {
    const code = claimStrings(languageEntities[langQid], "P424")[0];
    if (code) codeByItem.set(qid, code);
  }
  if (codeByItem.size === 0) return resolved;

  const neededCodes = [...new Set(codeByItem.values())].join("|");
  const nativeEntities = await wbGetEntities([...codeByItem.keys()], "labels", neededCodes);
  for (const [qid, code] of codeByItem) {
    const nativeLabel = nativeEntities[qid]?.labels?.[code]?.value;
    if (nativeLabel) resolved.set(qid, { label: nativeLabel, openLibraryId: unresolved.get(qid)!.openLibraryId });
  }

  return resolved;
}

function toAuthorRelations(
  qids: string[],
  relation: AuthorRelation["relation"],
  resolved: Map<string, ResolvedItem>
): AuthorRelation[] {
  return qids.flatMap((qid) => {
    const item = resolved.get(qid);
    return item ? [{ relation, wikidataId: qid, label: item.label, openLibraryId: item.openLibraryId }] : [];
  });
}

function toConceptRelations(
  qids: string[],
  relation: SubjectConcept["relation"],
  resolved: Map<string, ResolvedItem>
): SubjectConcept[] {
  return qids.flatMap((qid) => {
    const item = resolved.get(qid);
    return item ? [{ relation, wikidataId: qid, label: item.label }] : [];
  });
}

/** Influenced-by (P737, and its inverse), notable works (P800), and literary movement (P135). */
export async function fetchAuthorRelations(qid: string): Promise<AuthorRelation[]> {
  if (!isValidQid(qid)) return [];

  const [centerEntities, influencedQids] = await Promise.all([
    wbGetEntities([qid], "claims"),
    searchReverseStatementQids("P737", qid),
  ]);
  const center = centerEntities[qid];

  const influencedByQids = claimItemIds(center, "P737");
  const notableWorkQids = claimItemIds(center, "P800");
  const movementQids = claimItemIds(center, "P135");

  const resolved = await resolveItems([...influencedByQids, ...influencedQids, ...notableWorkQids, ...movementQids]);

  return [
    ...toAuthorRelations(influencedByQids, "influencedBy", resolved),
    ...toAuthorRelations(influencedQids, "influenced", resolved),
    ...toAuthorRelations(notableWorkQids, "notableWork", resolved),
    ...toAuthorRelations(movementQids, "movement", resolved),
  ];
}

/** Broader (P279) and narrower (inverse P279) concepts. */
export async function fetchRelatedConcepts(qid: string): Promise<SubjectConcept[]> {
  if (!isValidQid(qid)) return [];

  const [centerEntities, narrowerQids] = await Promise.all([
    wbGetEntities([qid], "claims"),
    searchReverseStatementQids("P279", qid, 20),
  ]);
  const broaderQids = claimItemIds(centerEntities[qid], "P279").slice(0, 20);

  const resolved = await resolveItems([...broaderQids, ...narrowerQids]);

  return [
    ...toConceptRelations(broaderQids, "broader", resolved),
    ...toConceptRelations(narrowerQids, "narrower", resolved),
  ];
}

/** Pen names (P742). */
export async function fetchPseudonyms(qid: string): Promise<string[]> {
  if (!isValidQid(qid)) return [];
  const entities = await wbGetEntities([qid], "claims");
  return [...new Set(claimStrings(entities[qid], "P742"))];
}

/**
 * Genre(s) (P136) for a literary work — e.g. "thriller", "science fiction",
 * "technological non-fiction literature". Unlike LOC's GSAFD genre/form
 * terms (assigned mainly to fiction), Wikidata editors tag P136 on nonfiction
 * works too, so this is used as a second source alongside LOC rather than a
 * fallback for when LOC has nothing.
 */
export async function fetchGenres(qid: string): Promise<string[]> {
  if (!isValidQid(qid)) return [];
  const entities = await wbGetEntities([qid], "claims");
  const genreQids = claimItemIds(entities[qid], "P136");
  if (genreQids.length === 0) return [];

  const resolved = await resolveItems(genreQids);
  return genreQids.flatMap((genreQid) => {
    const item = resolved.get(genreQid);
    return item ? [item.label] : [];
  });
}
