# LCSH as a supplementary, source-tagged source — design spec

Status: approved design, not yet implemented.

## Why

Book Explorer already pulls Library of Congress (LCSH/GSAFD) subject and
genre terms per-book via the SRU/MODS bibliographic gateway
(`apps/server/src/sources/loc.ts`), merging them with Open Library's own
subject strings through `mergeLabelLists`. That merge is silent: once two
lists are combined, nothing downstream can say which source(s) produced a
given term, and the UI shows one undifferentiated list of chips.

Separately, `SubjectDetail` (`/subject/[slug]`) shows "Broader topics" and
"Narrower topics" sourced only from Wikidata (`P279` claims resolved via
`fetchRelatedConcepts` in `wikidata.ts`). Library of Congress also
publishes its own authoritative broader/narrower hierarchy for LCSH
headings, via a separate API (`id.loc.gov`'s linked-data vocabulary
service) that nothing in this codebase currently touches.

The user wants both gaps closed as one effort:

1. Keep Open Library as the base subject vocabulary (broad, crowd-sourced,
   not limited to LCSH's controlled list) — never replace it.
2. Add LCSH as a second, deduped-in source for subject/genre chips on
   book/work pages, and surface per-term provenance so a user can see a
   term came from Open Library, LCSH, or both.
3. Do the same for Subject-page broader/narrower concepts: keep Wikidata's
   list, supplement with LCSH's own broader/narrower terms (a new
   `id.loc.gov` lookup), deduped and source-tagged the same way.

## Non-goals

- Not touching the existing `loc.ts` SRU/MODS gateway's own behavior — it
  keeps doing exactly what it does today (fetching LCSH/GSAFD terms for a
  specific ISBN's catalog record). This spec only changes how its output is
  *merged and labeled* downstream.
- Not adding LCSH lookups anywhere there isn't already a subject/genre or
  broader/narrower list (e.g. no change to author pages, graph explorer
  nodes, or search).
- Not resolving every Wikidata/LCSH term to a canonical cross-reference —
  "sources" is a simple set of labels (`"openLibrary"`, `"lcsh"`,
  `"wikidata"`), not a full authority-matching system.

## New: `id.loc.gov` linked-data source module

New file `apps/server/src/sources/locLinkedData.ts` (distinct from the
existing `loc.ts`, which hits a different LOC system — the SRU
bibliographic gateway, not this linked-data vocabulary API).

```ts
/** Case-insensitive exact match against LCSH's authorized label for `name`, via id.loc.gov's suggest index. Returns the heading's id.loc.gov URI, or null if no exact match is found (the index is left-anchored, so near-misses like "Fairy tales--Adaptations" can rank first for a plain "Fairy tales" query — those are filtered out here). */
export function findSubjectHeadingUri(name: string): Promise<string | null>;

/** Broader/narrower LCSH headings for a subject heading URI, as plain labels (skos:broader/skos:narrower give bare URIs with no inline label, so each is resolved with one further request, run in parallel). */
export function fetchBroaderNarrower(uri: string): Promise<{ broader: string[]; narrower: string[] }>;
```

Implementation notes:
- `findSubjectHeadingUri`: `GET https://id.loc.gov/authorities/subjects/suggest2/?q=<name>`, take the first `hits[]` entry whose `aLabel` matches `name` case-insensitively; return its `uri`, else `null`. No results, a network error, or no exact match all resolve to `null` (treated as "LOC has nothing to add," same as the existing `EMPTY_METADATA` fallback pattern in `loc.ts`) — a failure here must never fail the subject/book/work lookup it supplements.
- `fetchBroaderNarrower`: `GET <uri>.skos.json`, read the `skos:broader`/`skos:narrower` arrays (bare URIs). For each, `GET <narrowerOrBroaderUri>.skos.json` and read its own `skos:prefLabel`, in parallel (`Promise.all`); drop any that fail to resolve rather than failing the whole call. Typically 2-5 URIs per direction, so this is a handful of parallel requests — acceptable given subjects are cached 24h (`subjectCache` in `subjectService.ts`).
- Both functions use the same `fetchWithTimeout` + `USER_AGENT` pattern as every other source module. No caching inside this module — callers already sit behind `TtlCache`.

## Shared types (`packages/shared/src/index.ts`)

Add one new schema, reused everywhere a label list currently loses
provenance on merge:

```ts
export const TaggedTermSchema = z.object({
  label: z.string(),
  sources: z.array(z.enum(["openLibrary", "lcsh", "wikidata"])),
});
export type TaggedTerm = z.infer<typeof TaggedTermSchema>;
```

Changed schemas:
- `BookSchema.subjects`, `BookSchema.genres`: `z.array(z.string())` →
  `z.array(TaggedTermSchema)`.
- `WorkSchema.subjects`, `WorkSchema.genres`: same change.
- `SubjectConceptSchema`: add `sources: z.array(z.enum(["wikidata", "lcsh"]))`.
  Drop the existing `wikidataId: z.string()` required field, replace with
  `wikidataId: z.string().nullable()` (a merged concept may have come from
  LCSH only, with no Wikidata match) — the app's only use of this field is
  as a React list key, so callers should key off `label` instead (already
  unique post-dedup) and treat `wikidataId` as display-only data for
  "View on Wikidata"-style use if ever added later.

No other schema changes — `SubjectSchema` itself is unaffected (it still
has one `name`/`slug`, not a list).

## Server: merge logic

Replace `mergeLabelLists` (`apps/server/src/sources/loc.ts`) with a
source-aware version. Its two current call sites
(`bookService.ts:89-90`, `workService.ts:44-45`) each already call it with
exactly two label lists in a fixed order — `(locTerms, otherSourceTerms)`
— so the replacement keeps the same call shape, just changes what it
returns and how each input list is tagged:

```ts
/** Merges label lists from different sources into source-tagged terms, deduplicated case-insensitively (first-seen spelling wins). Each input list is tagged with the source name given for it. */
export function mergeTaggedTerms(...lists: { source: TaggedTerm["sources"][number]; labels: string[] }[]): TaggedTerm[]
```

Call sites become:
```ts
subjects: mergeTaggedTerms(
  { source: "lcsh", labels: locMetadata.subjects },
  { source: "openLibrary", labels: ol.subjects },
),
genres: mergeTaggedTerms(
  { source: "lcsh", labels: locMetadata.genres },
  { source: "wikidata", labels: wikidataGenres },
),
```
(genres' second source stays `"wikidata"`, matching today's actual source
— `wikidataGenres` comes from `wikidata.fetchGenres`, not Open Library;
only the subjects line's second source is `"openLibrary"`.)

A label appearing in more than one input list gets both sources recorded
on one `TaggedTerm`, case-insensitive, first-seen spelling kept — same
dedup semantics `mergeLabelLists` already has today, just no longer
throwing away which list(s) a label came from.

## Server: `subjectService.ts`

After the existing Wikidata lookup (`searchConceptQid` +
`fetchRelatedConcepts`), add a parallel LCSH lookup:

```ts
const qid = await wikidata.searchConceptQid(ol.name);
const [wikidataConcepts, lcshUri] = await Promise.all([
  qid ? wikidata.fetchRelatedConcepts(qid) : Promise.resolve([]),
  locLinkedData.findSubjectHeadingUri(ol.name).catch(() => null),
]);
const lcshConcepts = lcshUri ? await locLinkedData.fetchBroaderNarrower(lcshUri).catch(() => ({ broader: [], narrower: [] })) : { broader: [], narrower: [] };
```

Merge both into one `SubjectConcept[]`, grouped by relation
(`broader`/`narrower`), deduped case-insensitively on label, each entry
tagging which source(s) produced it and keeping a `wikidataId` only when
Wikidata itself produced that label (`null` for an LCSH-only term). A
small local helper (not exported, lives in `subjectService.ts`) does this
grouping — it's specific enough to this one merge (two relations, two
possible sources) that it doesn't need to be a shared utility.

A failed LCSH lookup (network error, no match) degrades to "no LCSH
concepts" exactly like a failed Wikidata lookup already degrades today —
it never fails the subject page itself.

## UI: source badges on chips

Every place a subject/genre/concept chip is rendered from a `TaggedTerm`
(or the reshaped `SubjectConcept`) gets a small per-chip source indicator,
replacing the plain label-only `Pressable`/`Text` chip used today:

- A short 1-2 letter badge (`LC` for `lcsh`, `OL` for `openLibrary`, `WD`
  for `wikidata`) rendered as small, muted text at the trailing edge of the
  chip, inside the existing pill — not a separate element outside it. When
  a term has more than one source, show both badges separated by a hairline
  dot (e.g. `LC·OL`).
- New small presentational component `apps/app/src/components/SourceBadge.tsx`
  taking `sources: ("openLibrary" | "lcsh" | "wikidata")[]` (the union of
  `TaggedTerm["sources"]` and `SubjectConcept["sources"]`) and rendering
  this, reused by every chip style (genre tags, subject tags, concept tags)
  rather than duplicating the badge markup per screen.
- Affected call sites: `BookDetail`'s genre/subject tags, `WorkDetail`'s
  genre/subject tags, `SubjectDetail`'s broader/narrower concept tags.
  `SavedBookEditor`'s own editable tag list (user-added/edited subjects on
  a saved book) is unaffected — those are plain user-entered strings with
  no source to tag, not `TaggedTerm`s.

## Testing

- `locLinkedData.ts`: unit tests mirroring `loc.test.ts`'s style — mock
  `fetchWithTimeout` responses for `suggest2` and `.skos.json`, cover: a
  clean exact match, a left-anchored near-miss that must be rejected, no
  match at all, and broader/narrower resolution with 0/1/multiple terms.
- `mergeTaggedTerms`: unit tests covering no overlap, full overlap (same
  label from both sources), case-insensitive matching, and first-seen
  spelling preserved.
- `subjectService.ts`: existing tests (if any) extended to cover an LCSH
  match merging with Wikidata concepts, and an LCSH miss leaving Wikidata's
  own list untouched.
- No new component/snapshot tests beyond what this app already has for
  comparable chip UI (none today) — `SourceBadge` is simple enough to be
  covered implicitly by its callers' existing manual verification.
