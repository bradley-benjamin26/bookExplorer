import { fetchWithTimeout } from "../httpClient.js";
import { USER_AGENT } from "./openLibrary.js";

// id.loc.gov's linked-data vocabulary service for LCSH — distinct from
// loc.ts's SRU bibliographic gateway (lx2.loc.gov). This endpoint resolves a
// subject heading's own label to its authority URI and walks its SKOS
// broader/narrower hierarchy, rather than looking up a book's catalog record.
const SUGGEST_URL = "https://id.loc.gov/authorities/subjects/suggest2/";

const SKOS_BROADER = "http://www.w3.org/2004/02/skos/core#broader";
const SKOS_NARROWER = "http://www.w3.org/2004/02/skos/core#narrower";
const SKOS_PREF_LABEL = "http://www.w3.org/2004/02/skos/core#prefLabel";

interface Suggest2Hit {
  aLabel: string;
  uri: string;
}
interface Suggest2Response {
  hits?: Suggest2Hit[];
}

interface SkosRef {
  "@id": string;
}
interface SkosEntry {
  "@id": string;
  [SKOS_BROADER]?: SkosRef[];
  [SKOS_NARROWER]?: SkosRef[];
  [SKOS_PREF_LABEL]?: { "@value": string }[];
}

// LCSH topical headings are conventionally plural ("Safaris", "Automobiles")
// while the name a book's actually catalogued under elsewhere (Open
// Library's subject name, a Wikidata label) is often the singular form
// ("Safari") — confirmed live: Open Library's "Safari" subject has no exact
// LCSH match, but LCSH's own "Safaris" heading links back to the very same
// Wikidata item. Trying the plain add/strip-trailing-"s" variant alongside
// the exact label catches this without a full pluralization library, and
// without weakening the near-miss guard below: neither variant of "fairy
// tales" ever equals "fairy tales--adaptations".
function labelVariants(name: string): string[] {
  const target = name.toLowerCase().trim();
  const variants = [target];
  if (target.endsWith("s")) variants.push(target.slice(0, -1));
  else variants.push(`${target}s`);
  return variants;
}

/**
 * Resolves a subject heading's own label (e.g. "Fairy tales") to its LCSH
 * authority URI via id.loc.gov's suggest2 endpoint. Requires an exact,
 * case-insensitive match against the label or its singular/plural variant —
 * a left-anchored near-miss like "Fairy tales--Adaptations" is a different,
 * more specific heading and must not be treated as a match. Never throws:
 * any failure (network error, non-ok response, no hits, no match) degrades
 * to `null`.
 */
export async function findSubjectHeadingUri(name: string): Promise<string | null> {
  try {
    const url = `${SUGGEST_URL}?q=${encodeURIComponent(name)}`;
    const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    const data = (await res.json()) as Suggest2Response;
    const targets = labelVariants(name);
    const hit = (data.hits ?? []).find((h) => targets.includes(h.aLabel?.toLowerCase()));
    return hit?.uri ?? null;
  } catch {
    return null;
  }
}

async function resolveLabel(uri: string): Promise<string | null> {
  const res = await fetchWithTimeout(`${uri}.skos.json`, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const entries = (await res.json()) as SkosEntry[];
  const entry = entries.find((e) => e["@id"] === uri);
  return entry?.[SKOS_PREF_LABEL]?.[0]?.["@value"] ?? null;
}

async function resolveLabels(uris: string[]): Promise<string[]> {
  const results = await Promise.allSettled(uris.map(resolveLabel));
  return results.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
}

/**
 * Fetches the broader/narrower SKOS relations for an LCSH authority URI and
 * resolves each related URI to its own prefLabel. Each list is capped to 20
 * URIs before resolution (some headings, e.g. "Fiction", have 80+ narrower
 * terms) to bound the number of outgoing requests. Resolutions run in
 * parallel and a failed one is dropped rather than failing the whole call —
 * one bad broader/narrower lookup shouldn't erase the rest. Never throws:
 * any failure (top-level request, absent keys) degrades to empty arrays.
 */
export async function fetchBroaderNarrower(uri: string): Promise<{ broader: string[]; narrower: string[] }> {
  try {
    const res = await fetchWithTimeout(`${uri}.skos.json`, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return { broader: [], narrower: [] };
    const entries = (await res.json()) as SkosEntry[];
    const entry = entries.find((e) => e["@id"] === uri);
    const broaderUris = (entry?.[SKOS_BROADER] ?? []).map((r) => r["@id"]).slice(0, 20);
    const narrowerUris = (entry?.[SKOS_NARROWER] ?? []).map((r) => r["@id"]).slice(0, 20);

    const [broader, narrower] = await Promise.all([resolveLabels(broaderUris), resolveLabels(narrowerUris)]);
    return { broader, narrower };
  } catch {
    return { broader: [], narrower: [] };
  }
}
