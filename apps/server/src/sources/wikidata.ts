import type { AuthorRelation } from "@book-explorer/shared";
import { USER_AGENT } from "./openLibrary.js";

const RELATION_KEYWORDS = ["writer", "author", "novelist", "poet", "playwright", "journalist"];

interface WbSearchResult {
  search: { id: string; description?: string }[];
}

/** Falls back to a Wikidata name search when Open Library has no `remote_ids.wikidata`. */
export async function searchAuthorQid(name: string): Promise<string | null> {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
    name
  )}&language=en&format=json&type=item&limit=5`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Wikidata search failed: ${res.status}`);

  const body = (await res.json()) as WbSearchResult;
  const match = body.search.find((r) =>
    RELATION_KEYWORDS.some((kw) => r.description?.toLowerCase().includes(kw))
  );
  return (match ?? body.search[0])?.id ?? null;
}

interface SparqlBinding {
  relation: { value: string };
  item: { value: string };
  itemLabel: { value: string };
  openLibraryId?: { value: string };
}

function qidFromUri(uri: string): string {
  return uri.split("/").pop() ?? uri;
}

/**
 * Influenced-by (P737, and its inverse), notable works (P800), and movement
 * (P135), in one UNION query so multi-valued fields don't cross-multiply.
 * Wikidata items commonly carry more than one Open Library ID (P648), which
 * produces duplicate rows per relation — those are collapsed below.
 */
export async function fetchAuthorRelations(qid: string): Promise<AuthorRelation[]> {
  const query = `
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
  `;

  const res = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/sparql-results+json" },
  });
  if (!res.ok) throw new Error(`Wikidata SPARQL query failed: ${res.status}`);

  const body = (await res.json()) as { results: { bindings: SparqlBinding[] } };

  const byKey = new Map<string, AuthorRelation>();
  for (const row of body.results.bindings) {
    const wikidataId = qidFromUri(row.item.value);
    const key = `${row.relation.value}:${wikidataId}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        relation: row.relation.value as AuthorRelation["relation"],
        wikidataId,
        label: row.itemLabel.value,
        openLibraryId: row.openLibraryId?.value ?? null,
      });
    }
  }
  return [...byKey.values()];
}
