# LCSH Source-Tagging Supplement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Library of Congress Subject Headings (LCSH) as a second,
deduped-in, source-tagged source for subject/genre chips on book/work
pages and for broader/narrower concepts on the Subject page, without
replacing Open Library or Wikidata as the base vocabulary.

**Architecture:** A new `id.loc.gov` linked-data source module
(`locLinkedData.ts`) resolves a subject name to an LCSH heading URI and its
broader/narrower terms. A new shared `TaggedTerm` type carries a label plus
which source(s) produced it. Server-side merge logic
(`mergeTaggedTerms`, replacing `mergeLabelLists`) and a subject-concept
merge in `subjectService.ts` combine sources while preserving provenance.
Client-side, a new `SourceBadge` component renders that provenance on
every affected chip.

**Tech Stack:** TypeScript, Fastify (server), Expo/React Native (app), Zod
(shared schemas), Vitest (server tests).

**Spec:** `docs/superpowers/specs/2026-10-21-lcsh-source-tagging-design.md`

## Global Constraints

- A failed LCSH lookup (network error, no match, resolution failure) must
  never fail the book/work/subject lookup it supplements — always degrade
  to "LCSH has nothing to add" (per spec's "New: `id.loc.gov` linked-data
  source module" and "Server: `subjectService.ts`" sections).
- `findSubjectHeadingUri` only returns a URI on a case-insensitive **exact**
  match of `aLabel`; a left-anchored near-miss (e.g. "Fairy
  tales--Adaptations" for query "Fairy tales") must be rejected, not
  returned.
- Dedup across sources is case-insensitive; first-seen spelling is kept
  (matches `mergeLabelLists`'s existing semantics).
- `genres`' second source tag is `"wikidata"`, not `"openLibrary"` — the
  genre list's non-LCSH input is always `wikidata.fetchGenres`, never Open
  Library, in both `bookService.ts` and `workService.ts`.
- `SavedBookRecord.subjects`/`genres` (local saved-book storage) stay plain
  `string[]` — never becomes `TaggedTerm[]`. Only the wire-level `Book`/
  `Work` schemas change shape.
- No new runtime dependency — use the existing `fetchWithTimeout` +
  `USER_AGENT` pattern already used by every other source module.

## Review Focus

- **LCSH lookup for a subject name with no LCSH heading at all** (e.g. a
  very niche or malformed Open Library subject string) — `suggest2`
  returns hits but none matches exactly; the system must show Open
  Library's/Wikidata's data alone, with no "LC" badge anywhere, not an
  error or an empty subject page.
- **A term identical except for case or trailing punctuation across two
  sources** (e.g. Open Library's "fairy tales" vs LCSH's "Fairy tales.")
  — must merge into one `TaggedTerm` with both sources recorded, not
  appear as two separate chips.
- **`fetchBroaderNarrower` where one or more narrower/broader URIs fail to
  resolve** (a stale or malformed URI, a timeout on one of several
  parallel requests) — must drop just that one term, not fail the whole
  subject-concept merge or leave `Promise.all` rejecting the entire batch.
- **A concept with `sources: ["lcsh"]` and no Wikidata match** — must
  render with `wikidataId: null` without crashing the "View on
  Wikidata"-adjacent UI or the React list `key` (which must use `label`,
  not `wikidataId`, post-reshape).
- **An existing saved book re-opened after this change ships** — a
  `SavedBookRecord` written before this change has `subjects`/`genres` as
  plain strings already (unaffected format), so `SavedBookEditor`'s
  `TagEditor` must keep working unchanged on old and new saved records
  alike; this is exercised by Task 6 keeping `SavedBookRecord`'s own shape
  untouched and `saveBookFromApi`'s label-extraction being the only call
  site that changes.

---

## Task 1: Shared `TaggedTerm` type and schema changes

**Files:**
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `TaggedTermSchema`/`TaggedTerm` (`{ label: string; sources: ("openLibrary" | "lcsh" | "wikidata")[] }`), used by Task 2's `mergeTaggedTerms`, Task 3's `bookService.ts`/`workService.ts`, Task 4's `wikidata.ts`/`subjectService.ts`, and Task 8's `SourceBadge`.
- Produces: reshaped `SubjectConceptSchema` — `relation: z.enum(["broader", "narrower"])`, `label: z.string()`, `sources: z.array(z.enum(["wikidata", "lcsh"]))`, `wikidataId: z.string().nullable()` (was required `z.string()`).
- Produces: `BookSchema.subjects`/`genres` and `WorkSchema.subjects`/`genres` now `z.array(TaggedTermSchema)` (were `z.array(z.string())`).

`packages/shared` has no test script, vitest devDependency, or even its
own `tsconfig.json` (confirmed: it's typechecked only as a dependency of
the consuming workspaces, via their own `tsc --noEmit`, since
`package.json`'s `main`/`types` point straight at `src/index.ts`) — so
there is no standalone verification command for this task to run.
Adding a test harness here is out of scope for this feature. This
change is verified by Task 3's and Task 6's typecheck runs, the first
two tasks downstream that actually compile against it.

- [ ] **Step 1: Add `TaggedTermSchema`/`TaggedTerm` and apply the schema changes in `packages/shared/src/index.ts`**

Add near `SubjectConceptSchema` (around line 145):
```ts
export const TaggedTermSchema = z.object({
  label: z.string(),
  sources: z.array(z.enum(["openLibrary", "lcsh", "wikidata"])),
});
export type TaggedTerm = z.infer<typeof TaggedTermSchema>;
```
Change `BookSchema.subjects`/`genres` (lines 39, 45) and `WorkSchema.subjects`/`genres` (lines 132-133) from `z.array(z.string())` to `z.array(TaggedTermSchema)`.
Change `SubjectConceptSchema` (lines 145-149): add `sources: z.array(z.enum(["wikidata", "lcsh"]))`; change `wikidataId: z.string()` to `wikidataId: z.string().nullable()`.

- [ ] **Step 2: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): add TaggedTerm type, reshape Book/Work/SubjectConcept schemas"
```

---

## Task 2: `mergeTaggedTerms` (replaces `mergeLabelLists`)

**Files:**
- Modify: `apps/server/src/sources/loc.ts`
- Modify: `apps/server/src/sources/loc.test.ts`

**Interfaces:**
- Consumes: `TaggedTerm` from Task 1 (`import type { TaggedTerm } from "@book-explorer/shared"`).
- Produces: `mergeTaggedTerms(...lists: { source: TaggedTerm["sources"][number]; labels: string[] }[]): TaggedTerm[]`, used by Task 3's `bookService.ts`/`workService.ts`.

- [ ] **Step 1: Write the failing tests, replacing the existing `mergeLabelLists` describe block in `apps/server/src/sources/loc.test.ts`**

```ts
import { mergeTaggedTerms, parseModsRecord } from "./loc.js";

describe("mergeTaggedTerms", () => {
  it("tags each list's labels with that list's source", () => {
    expect(mergeTaggedTerms({ source: "lcsh", labels: ["Fiction"] }, { source: "openLibrary", labels: ["Mystery"] })).toEqual([
      { label: "Fiction", sources: ["lcsh"] },
      { label: "Mystery", sources: ["openLibrary"] },
    ]);
  });

  it("merges a label appearing in more than one list, case-insensitively, recording both sources", () => {
    expect(
      mergeTaggedTerms({ source: "lcsh", labels: ["Fiction"] }, { source: "openLibrary", labels: ["fiction", "Science Fiction"] })
    ).toEqual([
      { label: "Fiction", sources: ["lcsh", "openLibrary"] },
      { label: "Science Fiction", sources: ["openLibrary"] },
    ]);
  });

  it("keeps first-seen spelling when the same label recurs with different casing", () => {
    expect(mergeTaggedTerms({ source: "lcsh", labels: ["B", "A"] }, { source: "openLibrary", labels: ["C", "a"] })).toEqual([
      { label: "B", sources: ["lcsh"] },
      { label: "A", sources: ["lcsh", "openLibrary"] },
      { label: "C", sources: ["openLibrary"] },
    ]);
  });

  it("skips blank/whitespace-only labels", () => {
    expect(mergeTaggedTerms({ source: "lcsh", labels: ["Fiction", "  ", ""] }, { source: "openLibrary", labels: ["Mystery"] })).toEqual([
      { label: "Fiction", sources: ["lcsh"] },
      { label: "Mystery", sources: ["openLibrary"] },
    ]);
  });

  it("returns an empty array when given no lists or only empty lists", () => {
    expect(mergeTaggedTerms()).toEqual([]);
    expect(mergeTaggedTerms({ source: "lcsh", labels: [] }, { source: "openLibrary", labels: [] })).toEqual([]);
  });
});
```

Delete the old `mergeLabelLists` describe block (current lines 61-81).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/server -- loc.test.ts`
Expected: FAIL with "mergeTaggedTerms is not exported" or similar.

- [ ] **Step 3: Replace `mergeLabelLists` with `mergeTaggedTerms` in `apps/server/src/sources/loc.ts`**

Replace the existing `mergeLabelLists` function (lines 125-136) with:
```ts
/** Merges label lists from different sources into source-tagged terms, deduplicated case-insensitively (first-seen spelling wins, sources accumulate on that first-seen entry in the order their list was passed). */
export function mergeTaggedTerms(...lists: { source: TaggedTerm["sources"][number]; labels: string[] }[]): TaggedTerm[]
```
Import `TaggedTerm` as a type from `@book-explorer/shared` at the top of the file. The implementation follows the same case-insensitive dedup-by-lowercased-label approach `mergeLabelLists` already used, keyed on a `Map<string, TaggedTerm>` instead of a `Set<string>`, appending to `sources` (deduped) rather than skipping on a repeat.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=apps/server -- loc.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sources/loc.ts apps/server/src/sources/loc.test.ts
git commit -m "feat(server): replace mergeLabelLists with source-tagged mergeTaggedTerms"
```

---

## Task 3: Wire `mergeTaggedTerms` into `bookService.ts` and `workService.ts`

**Files:**
- Modify: `apps/server/src/services/bookService.ts:8,89-90`
- Modify: `apps/server/src/services/workService.ts:5,44-45`

**Interfaces:**
- Consumes: `mergeTaggedTerms` from Task 2.
- Produces: `Book.subjects`/`genres` and `Work.subjects`/`genres` now actually populated as `TaggedTerm[]` at runtime, matching Task 1's schema — this is what Task 7 (app-side `Book`/`Work` consumers) and Task 8 (chip UI) build on.

- [ ] **Step 1: Update the import and call sites in `apps/server/src/services/bookService.ts`**

Change the import on line 8 from `mergeLabelLists` to `mergeTaggedTerms`. Change lines 89-90:
```ts
subjects: mergeTaggedTerms({ source: "lcsh", labels: locMetadata.subjects }, { source: "openLibrary", labels: ol.subjects }),
genres: mergeTaggedTerms({ source: "lcsh", labels: locMetadata.genres }, { source: "wikidata", labels: wikidataGenres }),
```

- [ ] **Step 2: Update the import and call sites in `apps/server/src/services/workService.ts`**

Change the import on line 5 from `mergeLabelLists` to `mergeTaggedTerms`. Change lines 44-45 the same way as Step 1 (identical call shape, same variable names already in scope in this file).

- [ ] **Step 3: Typecheck the server workspace**

Run: `npm run typecheck --workspace=apps/server`
Expected: no errors — this task only changes call sites against the already-updated `mergeTaggedTerms` signature from Task 2, so this step is a compile-level check, not a new test.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/services/bookService.ts apps/server/src/services/workService.ts
git commit -m "feat(server): tag book/work subject and genre lists with their source"
```

---

## Task 4: `locLinkedData.ts` source module

**Files:**
- Create: `apps/server/src/sources/locLinkedData.ts`
- Create: `apps/server/src/sources/locLinkedData.test.ts`

**Interfaces:**
- Consumes: `fetchWithTimeout` from `apps/server/src/httpClient.ts`, `USER_AGENT` from `apps/server/src/sources/openLibrary.ts` (same imports `loc.ts` already uses).
- Produces: `findSubjectHeadingUri(name: string): Promise<string | null>` and `fetchBroaderNarrower(uri: string): Promise<{ broader: string[]; narrower: string[] }>`, used by Task 5's `subjectService.ts`.

- [ ] **Step 1: Write the failing tests for `findSubjectHeadingUri`**

Mock `fetchWithTimeout` (same mocking approach already used in this repo's other source tests — check `apps/server/src/sources/wikidata.test.ts` or `apps/server/src/sources/openLibrarySearch.test.ts` for the house pattern before writing these).

```ts
import { describe, expect, it, vi } from "vitest";
import { findSubjectHeadingUri, fetchBroaderNarrower } from "./locLinkedData.js";

describe("findSubjectHeadingUri", () => {
  it("returns the uri of a hit whose aLabel exactly matches the query, case-insensitively", async () => {
    // mock a suggest2 response with hits: [{ aLabel: "Fairy tales", uri: "http://id.loc.gov/authorities/subjects/sh85046925" }, ...]
    const uri = await findSubjectHeadingUri("fairy tales");
    expect(uri).toBe("http://id.loc.gov/authorities/subjects/sh85046925");
  });

  it("rejects a left-anchored near-miss that isn't an exact label match", async () => {
    // mock a suggest2 response whose first hit is aLabel: "Fairy tales--Adaptations" and no exact "Fairy tales" hit
    const uri = await findSubjectHeadingUri("Fairy tales");
    expect(uri).toBeNull();
  });

  it("returns null when the request fails", async () => {
    // mock fetchWithTimeout to reject
    const uri = await findSubjectHeadingUri("Fairy tales");
    expect(uri).toBeNull();
  });

  it("returns null when there are no hits at all", async () => {
    // mock a suggest2 response with hits: []
    const uri = await findSubjectHeadingUri("Zzzznonexistentsubjectzzzz");
    expect(uri).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing tests for `fetchBroaderNarrower`**

```ts
describe("fetchBroaderNarrower", () => {
  it("resolves broader and narrower uris to their labels", async () => {
    // mock the uri's own .skos.json with skos:broader/skos:narrower arrays of 2 uris each,
    // then mock each of those 4 uris' own .skos.json with a skos:prefLabel
    const result = await fetchBroaderNarrower("http://id.loc.gov/authorities/subjects/sh85046925");
    expect(result.broader).toEqual(["Children's stories", "Tales"]);
    expect(result.narrower.length).toBe(2);
  });

  it("drops a broader/narrower term whose own lookup fails, without failing the whole call", async () => {
    // mock one of the resolution requests to reject
    const result = await fetchBroaderNarrower("http://id.loc.gov/authorities/subjects/sh85046925");
    expect(result.broader.length).toBe(1); // one of two resolved
  });

  it("returns empty arrays when the uri has neither broader nor narrower terms", async () => {
    // mock a .skos.json with no skos:broader/skos:narrower keys
    const result = await fetchBroaderNarrower("http://id.loc.gov/authorities/subjects/sh00000000");
    expect(result).toEqual({ broader: [], narrower: [] });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test --workspace=apps/server -- locLinkedData.test.ts`
Expected: FAIL with "Cannot find module './locLinkedData.js'"

- [ ] **Step 4: Implement `apps/server/src/sources/locLinkedData.ts`**

```ts
import { fetchWithTimeout } from "../httpClient.js";
import { USER_AGENT } from "./openLibrary.js";

const SUGGEST_URL = "https://id.loc.gov/authorities/subjects/suggest2/";

interface Suggest2Hit {
  aLabel: string;
  uri: string;
}
interface Suggest2Response {
  hits: Suggest2Hit[];
}

export async function findSubjectHeadingUri(name: string): Promise<string | null>;

export async function fetchBroaderNarrower(uri: string): Promise<{ broader: string[]; narrower: string[] }>;
```

Implementation notes (from the spec):
- `findSubjectHeadingUri`: `GET ${SUGGEST_URL}?q=${encodeURIComponent(name)}`, parse as `Suggest2Response`, find the first hit whose `aLabel.toLowerCase() === name.toLowerCase().trim()`, return its `uri` or `null`. Wrap the whole function body in try/catch returning `null` on any thrown error (network failure, non-ok response, JSON parse failure) — never throw.
- `fetchBroaderNarrower`: `GET ${uri}.skos.json`, find the top-level entry whose `@id === uri`, read its `http://www.w3.org/2004/02/skos/core#broader`/`#narrower` arrays (each `{ "@id": string }[]`, possibly absent). For each uri in each array, fetch `<thatUri>.skos.json` in parallel and read that entry's own `http://www.w3.org/2004/02/skos/core#prefLabel[0]["@value"]`; use `Promise.allSettled` and keep only the fulfilled, non-empty labels so one failed resolution doesn't drop the rest. Both arrays default to `[]` if the key is absent or the top request fails (never throw).
- Both functions pass `{ headers: { "User-Agent": USER_AGENT } }` to `fetchWithTimeout`, matching every other source module.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test --workspace=apps/server -- locLinkedData.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/sources/locLinkedData.ts apps/server/src/sources/locLinkedData.test.ts
git commit -m "feat(server): add id.loc.gov linked-data source for LCSH headings"
```

---

## Task 5: Merge LCSH concepts into `subjectService.ts`

**Files:**
- Modify: `apps/server/src/services/subjectService.ts`
- Modify: `apps/server/src/sources/wikidata.ts:285-294` (`toConceptRelations`)
- Create: `apps/server/src/services/subjectService.test.ts` (none exists today — confirmed by file search)

**Interfaces:**
- Consumes: `findSubjectHeadingUri`/`fetchBroaderNarrower` from Task 4; reshaped `SubjectConceptSchema` from Task 1.
- Produces: `getSubjectDetail`'s `relatedConcepts` now carries `sources` per concept and a nullable `wikidataId`, merging Wikidata and LCSH broader/narrower terms.

- [ ] **Step 1: Update `toConceptRelations` in `apps/server/src/sources/wikidata.ts` to tag its output with `sources: ["wikidata"]`**

Change the return shape built in `toConceptRelations` (lines 285-294) to include `sources: ["wikidata"]` on each produced `SubjectConcept`, matching the reshaped schema from Task 1.

- [ ] **Step 2: Write the failing test for the subject-concept merge**

Create `apps/server/src/services/subjectService.test.ts`. Check this repo's existing service-test conventions first (there may be none to follow — in that case, mock `openLibrary.getSubject`, `wikidata.searchConceptQid`/`fetchRelatedConcepts`, and the new `locLinkedData` module the same way `loc.test.ts`/`locLinkedData.test.ts` mock `fetchWithTimeout`).

```ts
import { describe, expect, it, vi } from "vitest";
// mock ../sources/openLibrary.js, ../sources/wikidata.js, ../sources/locLinkedData.js
import { getSubjectDetail } from "./subjectService.js";

describe("getSubjectDetail", () => {
  it("merges a broader term present in both Wikidata and LCSH into one tagged concept", async () => {
    // mock wikidata.fetchRelatedConcepts to return [{ relation: "broader", label: "Tales", sources: ["wikidata"], wikidataId: "Q123" }]
    // mock locLinkedData.findSubjectHeadingUri to return a uri, fetchBroaderNarrower to return { broader: ["Tales"], narrower: [] }
    const subject = await getSubjectDetail("fairy_tales");
    expect(subject?.relatedConcepts).toEqual([
      { relation: "broader", label: "Tales", sources: ["wikidata", "lcsh"], wikidataId: "Q123" },
    ]);
  });

  it("includes an LCSH-only concept with a null wikidataId", async () => {
    // mock wikidata.fetchRelatedConcepts to return []
    // mock locLinkedData to return { broader: ["Folklore"], narrower: [] }
    const subject = await getSubjectDetail("fairy_tales");
    expect(subject?.relatedConcepts).toEqual([{ relation: "broader", label: "Folklore", sources: ["lcsh"], wikidataId: null }]);
  });

  it("falls back to Wikidata-only concepts when the LCSH lookup finds no heading", async () => {
    // mock locLinkedData.findSubjectHeadingUri to return null
    // mock wikidata.fetchRelatedConcepts to return one concept as in the first test
    const subject = await getSubjectDetail("fairy_tales");
    expect(subject?.relatedConcepts).toEqual([
      { relation: "broader", label: "Tales", sources: ["wikidata"], wikidataId: "Q123" },
    ]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test --workspace=apps/server -- subjectService.test.ts`
Expected: FAIL (either module-not-found for the mocked `locLinkedData` import, or a mismatched `relatedConcepts` shape).

- [ ] **Step 4: Implement the merge in `apps/server/src/services/subjectService.ts`**

Add the parallel LCSH lookup and a local (unexported) merge helper:
```ts
const [wikidataConcepts, lcshUri] = await Promise.all([
  qid ? wikidata.fetchRelatedConcepts(qid) : Promise.resolve([]),
  locLinkedData.findSubjectHeadingUri(ol.name).catch(() => null),
]);
const lcshConcepts = lcshUri
  ? await locLinkedData.fetchBroaderNarrower(lcshUri).catch(() => ({ broader: [] as string[], narrower: [] as string[] }))
  : { broader: [] as string[], narrower: [] as string[] };
const relatedConcepts = mergeSubjectConcepts(wikidataConcepts, lcshConcepts);
```
`mergeSubjectConcepts(wikidataConcepts: SubjectConcept[], lcsh: { broader: string[]; narrower: string[] }): SubjectConcept[]` groups by `relation`, deduping case-insensitively on `label` the same way `mergeTaggedTerms` does (first-seen spelling wins, sources accumulate), building LCSH-only entries with `wikidataId: null`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=apps/server -- subjectService.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/subjectService.ts apps/server/src/services/subjectService.test.ts apps/server/src/sources/wikidata.ts
git commit -m "feat(server): merge LCSH broader/narrower concepts into subject detail"
```

---

## Task 6: Fix `saveBookFromApi`'s snapshot for the new `TaggedTerm[]` shape

**Files:**
- Modify: `apps/app/src/storage/savedBooks.ts:64-65`
- Modify: `apps/app/src/storage/savedBooks.test.ts` (if it asserts on `saveBookFromApi`'s subjects/genres shape — check first)

**Interfaces:**
- Consumes: `Book` from `@book-explorer/shared` (now `TaggedTerm[]` subjects/genres, per Task 1).
- Produces: `SavedBookRecord.subjects`/`genres` continue to be populated as plain `string[]`, extracted from `TaggedTerm.label` — this is the only call site that needs to change for `savedBooks.ts` to keep compiling and behaving correctly against the new `Book` shape. `book/[isbn].tsx` and `work/[id].tsx` (Task 8) are untouched by this task — they still read the old, now-stale `string[]`-shaped field access until Task 8 fixes their rendering in the same pass as adding the badge UI, so running this repo's typecheck between Task 6 and Task 8 is expected to still show errors in those two files.

- [ ] **Step 1: Check whether `savedBooks.test.ts` asserts on the exact shape `saveBookFromApi` stores**

Run: `grep -n "subjects\|genres" apps/app/src/storage/savedBooks.test.ts`
Expected: tells you whether a test needs updating in this task or is unaffected (it likely passes plain string arrays as fixture input today, which will need updating to build a fixture `Book` with `TaggedTerm[]` subjects/genres instead).

- [ ] **Step 2: Update any affected fixture/test in `apps/app/src/storage/savedBooks.test.ts`**

Any test building a fixture `Book` for `saveBookFromApi` must give `subjects`/`genres` as `TaggedTerm[]` (e.g. `[{ label: "Fiction", sources: ["openLibrary"] }]`) and assert the stored `SavedBookRecord.subjects`/`genres` come back as plain `["Fiction"]`.

- [ ] **Step 3: Run the test to verify it fails against the current (unfixed) `saveBookFromApi`**

Run: `npm run test --workspace=apps/app -- savedBooks.test.ts`
Expected: FAIL — `record.subjects` is the raw `TaggedTerm[]` fixture, not extracted labels.

- [ ] **Step 4: Fix `saveBookFromApi` in `apps/app/src/storage/savedBooks.ts`**

Change lines 64-65 from `subjects: book.subjects, genres: book.genres,` to:
```ts
subjects: book.subjects.map((t) => t.label),
genres: book.genres.map((t) => t.label),
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test --workspace=apps/app -- savedBooks.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/storage/savedBooks.ts apps/app/src/storage/savedBooks.test.ts
git commit -m "fix(app): extract plain labels when snapshotting a saved book's subjects/genres"
```

---

## Task 7: `SourceBadge` component

**Files:**
- Create: `apps/app/src/components/SourceBadge.tsx`

**Interfaces:**
- Consumes: `theme`/`useTheme`/`useThemedStyles` from `apps/app/src/theme.ts`, `fonts` from the same.
- Produces: `SourceBadge({ sources }: { sources: ("openLibrary" | "lcsh" | "wikidata")[] })`, a small inline `Text`/`View` fragment rendering e.g. `LC`, `OL·LC`, used by Task 8.

- [ ] **Step 1: Implement `apps/app/src/components/SourceBadge.tsx`**

```tsx
import { StyleSheet, Text } from "react-native";
import { useThemedStyles, type Theme } from "../theme";

const BADGE_LABELS: Record<"openLibrary" | "lcsh" | "wikidata", string> = {
  openLibrary: "OL",
  lcsh: "LC",
  wikidata: "WD",
};

/** Small muted provenance label for a chip sourced from one or more external vocabularies — e.g. "LC" or "OL·LC". Renders nothing for an empty `sources` list. */
export function SourceBadge({ sources }: { sources: ("openLibrary" | "lcsh" | "wikidata")[] }) {
  const styles = useThemedStyles(createStyles);
  if (sources.length === 0) return null;
  return <Text style={styles.badge}> {sources.map((s) => BADGE_LABELS[s]).join("·")}</Text>;
}

function createStyles({ colors }: Theme) {
  return StyleSheet.create({
    badge: { fontSize: 10, color: colors.textFaint },
  });
}
```
(Leading space in the rendered string keeps a visual gap from the chip's own label text without needing a wrapping `View`/flex row at each call site — call sites render `<Text>{label}<SourceBadge sources={sources} /></Text>` as one `Text` tree, consistent with how `ReviewsSection`'s rating text already mixes a literal `★` into one `Text` node.)

- [ ] **Step 2: Manually verify via typecheck (no dedicated test — component is a pure, trivial render; its behavior is exercised through Task 8's call sites)**

Run: `npm run typecheck --workspace=apps/app`
Expected: no errors from this new file in isolation (it has no callers yet).

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/components/SourceBadge.tsx
git commit -m "feat(app): add SourceBadge component for subject/genre/concept provenance"
```

---

## Task 8: Render source-tagged chips on BookDetail, WorkDetail, SubjectDetail

**Files:**
- Modify: `apps/app/app/book/[isbn].tsx`
- Modify: `apps/app/app/work/[id].tsx`
- Modify: `apps/app/app/subject/[slug].tsx`

**Interfaces:**
- Consumes: `SourceBadge` from Task 7; `TaggedTerm`/reshaped `SubjectConcept` from Task 1.
- Produces: working chip UI — this is the plan's final observable deliverable.

- [ ] **Step 1: Update `BookDetail`'s genre/subject chip rendering in `apps/app/app/book/[isbn].tsx`**

`displaySubjects`/`displayGenres` (lines 77-78) become:
```ts
const displaySubjects: TaggedTerm[] = savedRecord
  ? savedRecord.subjects.map((label) => ({ label, sources: [] }))
  : (data?.subjects ?? []);
const displayGenres: TaggedTerm[] = savedRecord
  ? savedRecord.genres.map((label) => ({ label, sources: [] }))
  : (data?.genres ?? []);
```
(A saved record's own edited tags have no external source — they render with an empty `sources` array, which `SourceBadge` already renders as nothing, matching the spec's note that `SavedBookEditor`'s own tags are unaffected.)

Update the genre tag `Pressable` (lines ~143-149) and subject tag `Pressable` (lines ~161-169) to read `genre.label`/`subject.label` instead of the bare string, keep `key={genre.label}`/`key={subject.label}`, and render `<SourceBadge sources={genre.sources} />`/`<SourceBadge sources={subject.sources} />` inside the existing `Text`. `router.push(routes.subject(slugifySubject(genre.label)))` replaces the current bare-string version.

- [ ] **Step 2: Apply the identical change to `WorkDetail` in `apps/app/app/work/[id].tsx`**

Same shape — `WorkDetail` has no saved-record branch (it's always `data.genres`/`data.subjects` directly, per the file read earlier in this plan's context), so just update the genre/subject tag rendering (lines ~83-90, ~100-108) to use `.label` and add `<SourceBadge sources={...} />`.

- [ ] **Step 3: Update `SubjectDetail`'s concept chip rendering in `apps/app/app/subject/[slug].tsx`**

Change `key={concept.wikidataId}` (line 72) to `key={concept.label}` (per the Global Constraints note that a merged concept may have no `wikidataId`). Add `<SourceBadge sources={concept.sources} />` inside the existing `Text` at line 78.

- [ ] **Step 4: Run the app typecheck**

Run: `npm run typecheck --workspace=apps/app`
Expected: PASS

- [ ] **Step 5: Start the app and manually verify in the browser (per this project's `run` skill/pattern)**

Load a book/work/subject page known to have LCSH-catalogued data (e.g. a well-known classic novel's ISBN) and confirm: subject/genre chips show a source badge, a subject page's broader/narrower chips show a badge, and a saved book's edited tags still render with no badge and no crash.

- [ ] **Step 6: Commit**

```bash
git add apps/app/app/book/[isbn].tsx apps/app/app/work/[id].tsx apps/app/app/subject/[slug].tsx
git commit -m "feat(app): show source provenance badges on subject/genre/concept chips"
```

---

## Final: Whole-change verification

- [ ] **Step 1: Run the full server test suite**

Run: `npm run test --workspace=apps/server`
Expected: PASS

- [ ] **Step 2: Run the full app test suite**

Run: `npm run test --workspace=apps/app`
Expected: PASS

- [ ] **Step 3: Run both workspaces' typecheck**

Run: `npm run typecheck --workspace=apps/server && npm run typecheck --workspace=apps/app`
Expected: PASS
