import type { AuthorRelation, SubjectConcept } from "@book-explorer/shared";
import { fetchWithTimeout } from "../httpClient.js";
import { USER_AGENT } from "./openLibrary.js";

// The public SPARQL endpoint is noticeably slower than a plain REST call —
// a live run of the query below took ~8s for one moderately-connected
// author — so it gets a longer allowance than httpClient's 15s default
// rather than sharing it and risking healthy-but-slow queries timing out.
const SPARQL_TIMEOUT_MS = 25_000;

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

async function wbSearchEntities(name: string, limit: number): Promise<WbSearchResult> {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
    name
  )}&language=en&format=json&type=item&limit=${limit}`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Wikidata search failed: ${res.status}`);
  return res.json();
}

interface SparqlBinding {
  relation: { value: string };
  item: { value: string };
  itemLabel: { value: string };
  openLibraryId?: { value: string };
}

interface RelationRow {
  relation: string;
  wikidataId: string;
  label: string;
  openLibraryId: string | null;
}

function qidFromUri(uri: string): string {
  return uri.split("/").pop() ?? uri;
}

// QIDs are spliced directly into SPARQL query strings below. Wikidata's own
// search API only ever returns well-formed ids, but Open Library's
// `remote_ids.wikidata` field is free-text on a wiki anyone can edit, so it
// isn't trustworthy input — an unvalidated value here would be a SPARQL
// injection vector against Wikidata's public endpoint.
function isValidQid(qid: string): boolean {
  return /^Q[1-9]\d*$/.test(qid);
}

/**
 * Runs a UNION-shaped SPARQL query where each branch binds its own `?relation`
 * label — this avoids the cross-product blowup that several `OPTIONAL` blocks
 * would cause once an entity has more than one value for more than one
 * property. Wikidata items also commonly carry more than one Open Library ID
 * (P648), which produces duplicate rows per relation; those are collapsed here.
 */
async function runRelationQuery(query: string): Promise<RelationRow[]> {
  const res = await fetchWithTimeout(
    `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`,
    { headers: { "User-Agent": USER_AGENT, Accept: "application/sparql-results+json" } },
    SPARQL_TIMEOUT_MS
  );
  if (!res.ok) throw new Error(`Wikidata SPARQL query failed: ${res.status}`);

  const body = (await res.json()) as { results: { bindings: SparqlBinding[] } };

  const byKey = new Map<string, RelationRow>();
  for (const row of body.results.bindings) {
    const wikidataId = qidFromUri(row.item.value);
    const key = `${row.relation.value}:${wikidataId}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        relation: row.relation.value,
        wikidataId,
        label: row.itemLabel.value,
        openLibraryId: row.openLibraryId?.value ?? null,
      });
    }
  }
  return [...byKey.values()];
}

/** Influenced-by (P737, and its inverse), notable works (P800), and literary movement (P135). */
export async function fetchAuthorRelations(qid: string): Promise<AuthorRelation[]> {
  if (!isValidQid(qid)) return [];

  const rows = await runRelationQuery(`
    SELECT ?relation ?item ?itemLabel ?openLibraryId WHERE {
      { wd:${qid} wdt:P737 ?item . BIND("influencedBy" AS ?relation) }
      UNION
      { ?item wdt:P737 wd:${qid} . BIND("influenced" AS ?relation) }
      UNION
      { wd:${qid} wdt:P800 ?item . BIND("notableWork" AS ?relation) }
      UNION
      { wd:${qid} wdt:P135 ?item . BIND("movement" AS ?relation) }
      OPTIONAL { ?item wdt:P648 ?openLibraryId }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
  `);
  return rows.map((r) => ({ ...r, relation: r.relation as AuthorRelation["relation"] }));
}

/** Broader (P279) and narrower (inverse P279) concepts. */
export async function fetchRelatedConcepts(qid: string): Promise<SubjectConcept[]> {
  if (!isValidQid(qid)) return [];

  const rows = await runRelationQuery(`
    SELECT ?relation ?item ?itemLabel WHERE {
      { wd:${qid} wdt:P279 ?item . BIND("broader" AS ?relation) }
      UNION
      { ?item wdt:P279 wd:${qid} . BIND("narrower" AS ?relation) }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } LIMIT 20
  `);
  return rows.map(({ relation, wikidataId, label }) => ({
    relation: relation as SubjectConcept["relation"],
    wikidataId,
    label,
  }));
}
