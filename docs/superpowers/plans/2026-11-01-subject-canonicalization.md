# Subject Canonicalization & Merging Plan

> Implementation and automated tests for Tasks 1–5 are complete. The final manual endpoint check and commit steps below remain outstanding.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Horror tales, American", "Horror tales--American" and "American horror tales" are one subject on book/work pages and in full work/subject graphs, with one subject page whose book list unions what Open Library files under each spelling. The displayed name is the natural-order form ("American horror tales"), not LCSH's inverted heading. Lightweight path-search graphs intentionally skip canonicalization.

**Architecture:** LCSH authority records already encode these equivalences — the inverted form is the *authorized heading* (`aLabel`) and the natural form is a *variant label* (`vLabel`, a "USE" reference). Confirmed live against id.loc.gov's suggest2 endpoint: `q=American horror tales` returns one hit, `uri sh85062085`, `aLabel "Horror tales, American"`, `more.variantLabels ["American horror tales"]`. One lookup therefore gives both directions: the authority URI and every variant spelling. Before implementation, `findSubjectHeadingUri` rejected that hit because it only accepted matches against `aLabel`; it now resolves exact matches against authorized and variant labels.

The plan: resolve each subject label to its authority record (cached persistently — `TtlCache` already has a SQLite write-through tier via `namespace` + `CACHE_DB_PATH`), dedupe by authority URI in `mergeTaggedTerms` (where book and work subject lists are already built), carry the canonical slug on `TaggedTerm` so chips and graph nodes converge on one node id, and union variant slugs' Open Library book lists on subject pages.

**Tech Stack:** Fastify, TypeScript, vitest, `@book-explorer/shared`, id.loc.gov suggest2 + SKOS JSON.

**Spec:** The user's request (2026-11-01): dedupe "Horror tales, American" / "American horror tales" / "Horror Tales--American" into one displayed subject ("American Horror Tales") on work pages and in the graph; clicking it opens a graph/page combining both subject terms, from whichever spelling the user started at; mappings should be cached or saved for future use.

## Global Constraints

- A merge happens **only** on an exact LCSH identity: the label (or its `labelVariants` singular/plural form) slug-equals the hit's `aLabel`, `vLabel`, or one of `more.variantLabels`. No word-order heuristics — sorting words would falsely merge e.g. "War dogs" / "Dogs of war".
- Everything degrades: a failed/missing LOC lookup leaves that label exactly as it behaves today (deduped by `subjectKey`, slugged by `slugifySubject`). Failures are cached briefly (follow `optionalSource` / short-TTL conventions), never for the long canonical TTL.
- `getSubjectBooks` (the path finder's cheap subject) stays cheap: no canonicalization there. Path search not merging variants is acceptable.
- Genres are **not** canonicalized in this plan: LOC genre/form headings are LCGFT, a different vocabulary from LCSH subjects. `mergeTaggedTerms` keeps working without a canonical map.
- Bump `CACHE_SCHEMA_VERSION` in `apps/server/src/cache.ts` — cached Book/Work/Subject values change shape (`TaggedTerm.slug`) and subject slugs/names change.
- A subject page's returned `slug`/`name` may differ from the requested slug. Precedent already exists: legacy `"--"` slugs return `slugifySubject(slug)` today. The client must key off the response, not the request.
- Per-book cost: canonical lookups run at most 8 concurrently on a cold cache, then are cached. Per-subject-page cost: ≤ 2 extra Open Library subject fetches.

## Review Focus

1. No false merges: canonicalization only on exact slug equality against the authority's own labels (Task 2 tests).
2. An LOC outage neither breaks book/work/subject loads nor poisons the long-lived canonical cache (Tasks 3, 5).
3. First-seen-source behavior of `mergeTaggedTerms` is preserved for unresolved labels; resolved labels display the natural form and accumulate sources across variants (Task 3).
4. Graph node ids from book graphs, work graphs and subject graphs converge: all use the canonical slug when known (Task 4).
5. Subject page book union dedupes by `openLibraryWorkId` and keeps the primary slug's ordering first (Task 5).
6. `subjectKey` dropping commas must not break the existing `", fiction"` suffix rule or make any key empty (Task 1).

---

### Task 1: Shared groundwork — `subjectKey` commas and `TaggedTerm.slug`

**Files:**
- Modify: `packages/shared/src/index.ts` (`subjectKey`, `TaggedTermSchema`)
- Test: `apps/server/src/subjectTerms.test.ts`

**Interfaces:**
- `subjectKey` also drops commas (after the existing `", fiction"` suffix strip), so "Horror tales, American" and "Horror tales--American" share a key. These two already share a *slug* (same graph node); this makes them share a *chip* too.
- `TaggedTermSchema` gains `slug: z.string().optional()` — the canonical subject slug when LCSH resolved the label; absent otherwise. Optional, so every cached and client-stored Book/Work still parses.

- [x] **Step 1: Write the failing tests**

```ts
it("keys comma-inverted and subdivided spellings together", () => {
  expect(subjectKey("Horror tales, American")).toBe(subjectKey("Horror tales--American"));
  expect(subjectKey("Horror tales, American")).toBe("horror tales american");
  // the existing rules still hold
  expect(subjectKey("Dune (Imaginary place), fiction")).toBe(subjectKey("Dune (Imaginary Place)"));
  expect(subjectKey(",")).not.toBe("");
});
it("TaggedTerm parses with and without a slug", () => {
  expect(TaggedTermSchema.parse({ label: "X", sources: ["lcsh"] }).slug).toBeUndefined();
  expect(TaggedTermSchema.parse({ label: "X", sources: ["lcsh"], slug: "x" }).slug).toBe("x");
});
```

- [x] **Step 2: Run to verify they fail** — `cd apps/server && npx vitest run src/subjectTerms.test.ts`
- [x] **Step 3: Implement** — in `subjectKey`, after the `", fiction"` strip: `.replace(/,/g, " ").replace(/\s+/g, " ").trim()`, keeping the final `|| plain` fallback.
- [x] **Step 4: Verify pass**, then run the app suite too (`cd apps/app && npx vitest run src/termsDraft.test.ts`) — `addTerm`/`visibleSubjects` use `subjectKey` and must still pass.
- [ ] **Step 5: Commit** — `feat(shared): subjectKey merges comma/subdivision spellings; TaggedTerm gains canonical slug`

---

### Task 2: `locLinkedData` resolves variant labels, not just authorized ones

**Files:**
- Modify: `apps/server/src/sources/locLinkedData.ts`
- Test: `apps/server/src/sources/locLinkedData.test.ts` (follow its existing fetch-mocking pattern)

**Interfaces:**
- `interface SubjectHeading { uri: string; heading: string; variants: string[] }`
- `findSubjectHeading(name: string): Promise<SubjectHeading | null>` — like `findSubjectHeadingUri`, but a hit matches when any `labelVariants(name)` slug equals the slug of `aLabel`, **`vLabel`, or any `more.variantLabels` entry**. Returns `heading = aLabel` and `variants = more.variantLabels ?? []`. Never throws.
- `findSubjectHeadingUri` becomes `(await findSubjectHeading(name))?.uri ?? null` — `subjectService` keeps working unchanged.
- `findSubjectHeadingWithStatus` distinguishes a definitive no-match from a failed lookup so canonical caches can apply different TTLs.
- `naturalSubjectLabel(heading: string, variants: string[]): string` — the display form. If `heading` matches `/^([^,]+), ([^,]+)$/` and some variant case-insensitively equals `"$2 $1"`, return that variant ("American horror tales"); otherwise return `heading`. Pure, exported for tests.

- [x] **Step 1: Write the failing tests** — mock a suggest2 response modeled on the live sh85062085 hit (`aLabel: "Horror tales, American"`, `vLabel: "American horror tales"`, `more: { variantLabels: ["American horror tales"] }`):
  - querying the variant spelling resolves to the authority, with heading and variants filled in;
  - a left-anchored near-miss (`aLabel: "Horror tales, American--History"`) still returns null;
  - `naturalSubjectLabel("Horror tales, American", ["American horror tales"])` is `"American horror tales"`; with no matching variant, or a heading with two commas, it returns the heading unchanged.
- [x] **Step 2: Verify fail** — `cd apps/server && npx vitest run src/sources/locLinkedData.test.ts`
- [x] **Step 3: Implement** (extend `Suggest2Hit` with optional `vLabel` and `more.variantLabels`).
- [x] **Step 4: Verify pass**, plus `npx vitest run src/services/subjectService.test.ts` (the `findSubjectHeadingUri` delegation must not change behavior).
- [ ] **Step 5: Commit** — `feat(server): resolve LCSH variant labels to their authorized heading`

---

### Task 3: Canonicalization service + canonical-aware `mergeTaggedTerms`

**Files:**
- Create: `apps/server/src/services/subjectCanon.ts`
- Modify: `apps/server/src/sources/loc.ts` (`mergeTaggedTerms`)
- Test: `apps/server/src/services/subjectCanon.test.ts`, `apps/server/src/sources/loc.test.ts`

**Interfaces:**
- `interface CanonicalSubject { uri: string; heading: string; display: string; slug: string; variants: string[] }` where `display = naturalSubjectLabel(heading, variants)` and `slug = slugifySubject(heading)`.
- `canonicalizeSubjects(labels: string[], callerEntry?: CacheEntryOptions): Promise<Map<string, CanonicalSubject | null>>` — resolves each distinct label at most 8 concurrently, through a `TtlCache` with namespace `"subjectCanon"` (persists through the SQLite tier when `CACHE_DB_PATH` is set). TTL 30 days for a resolved value and definitive no-match; failed lookups use a 1-minute TTL and shorten the caller's cache TTL too. Cache key: `subjectKey(label)`.
- `mergeTaggedTerms` signature changes from variadic to `mergeTaggedTerms(lists: {source, labels}[], canon?: Map<string, CanonicalSubject | null>)`. Dedupe key: `canon?.get(label)?.uri ?? subjectKey(label)`. For a canonical entry: `label = display`, `slug = canonical slug`; sources still accumulate across all contributors in list order. Unresolved labels behave exactly as today (first-seen spelling wins, no `slug`). Update the existing call sites and tests for the array parameter.

- [x] **Step 1: Write the failing tests**

```ts
// loc.test.ts — canon map provided:
const canon = new Map([
  ["Horror tales, American", C], ["American horror tales", C], // C = { uri: "sh85062085", heading: "Horror tales, American", display: "American horror tales", slug: "horror_tales_american" }
]);
expect(mergeTaggedTerms([
  { source: "lcsh", labels: ["Horror tales, American"] },
  { source: "openLibrary", labels: ["American horror tales", "Zombies"] },
], canon)).toEqual([
  { label: "American horror tales", slug: "horror_tales_american", sources: ["lcsh", "openLibrary"] },
  { label: "Zombies", sources: ["openLibrary"] },
]);
// and with no canon map, the existing expectations are unchanged.
```

In `subjectCanon.test.ts` (mock `findSubjectHeadingWithStatus`): one lookup per distinct `subjectKey`; a resolved label maps to its CanonicalSubject; a failed lookup yields null and is retried after its short TTL (assert via the mock's call count and `vi.useFakeTimers`).

- [x] **Step 2: Verify fail** — `cd apps/server && npx vitest run src/sources/loc.test.ts src/services/subjectCanon.test.ts`
- [x] **Step 3: Implement.**
- [x] **Step 4: Verify pass.**
- [ ] **Step 5: Commit** — `feat(server): canonicalize subject labels by LCSH authority in mergeTaggedTerms`

---

### Task 4: Wire into book/work services and graph node ids

**Files:**
- Modify: `apps/server/src/services/bookService.ts`, `apps/server/src/services/workService.ts` (subject `mergeTaggedTerms` calls get a canon map; genre calls just switch to the array signature)
- Modify: `apps/server/src/services/graphService.ts` (subject nodes), `apps/server/src/cache.ts` (`CACHE_SCHEMA_VERSION` bump)
- Modify: `apps/app/src/components/TermsSection.tsx` (chip navigation)
- Test: `apps/server/src/services/bookService.test.ts`, `graphQuery.test.ts` / graphService tests, `apps/app` component tests as applicable

**Interfaces:**
- In `bookService` / `workService`: after `locMetadata` and `olTerms` resolve, `const canon = await canonicalizeSubjects([...locMetadata.subjects, ...olTerms.subjects])` (never throws), passed to the subjects merge only.
- In `graphService.workGraph`, subject nodes keep the term: `plainSubjects` carries `{ label, slug? }`; node id = `` `subject:${term.slug ?? slugifySubject(term.label)}` ``, node label = `term.label`. Same for any other place a subject node id is derived from a `TaggedTerm`.
- In `TermsSection`, a chip press navigates to `tagged.find((t) => t.label === label)?.slug ?? slugifySubject(label)`.

- [x] **Step 1: Write the failing tests** — a work whose subjects include `{ label: "American horror tales", slug: "horror_tales_american", sources: [...] }` produces a graph node `subject:horror_tales_american` labeled "American horror tales"; a slug-less term falls back to `slugifySubject` exactly as today; bookService passes a canon map built from both sources' labels (assert via the mocked `canonicalizeSubjects` / `mergeTaggedTerms` args, matching the file's existing mocking style).
- [x] **Step 2: Verify fail.**
- [x] **Step 3: Implement**, including the `CACHE_SCHEMA_VERSION` bump with its one-line comment.
- [x] **Step 4: Verify pass** — full workspace tests and typechecks pass.
- [ ] **Step 5: Commit** — `feat: canonical subject slugs on book/work terms, graph nodes and chips`

---

### Task 5: Subject pages union their variant spellings

**Files:**
- Modify: `apps/server/src/services/subjectService.ts` (`getSubjectDetail` only — `getSubjectBooks` untouched)
- Test: `apps/server/src/services/subjectService.test.ts`

**Interfaces:**
- After `loadOlSubject(slug)` succeeds, `getSubjectDetail` resolves `canonicalizeSubjects([ol.name])`. When resolved:
  - `variantSlugs` = canonical slug + each variant's `slugifySubject`, minus the already-loaded slug, capped at 2;
  - each extra slug is fetched with `openLibrary.getSubject`, individually degradable (a failure just skips that variant — wrap with the `optionalSource` pattern so it's logged and the cache entry TTL is shortened);
  - `books` = primary list first, then variants' books, deduped by `openLibraryWorkId`; `workCount` = max across fetched variants;
  - `name` = the canonical `display`, `slug` = the canonical slug (so `subjectGraph`'s `centerId` and the page JSON-LD converge regardless of which spelling was clicked).
- Unresolved (no LCSH heading): behavior identical to today.
- The existing LCSH concept lookup reuses `findSubjectHeading`'s URI rather than issuing a second suggest2 call, where convenient.

- [x] **Step 1: Write the failing tests** — mock Open Library returning different work lists for `horror_tales_american` and `american_horror_tales`, and canonicalization linking them: requesting **either** slug yields one Subject named "American horror tales" with slug `horror_tales_american`, the union of both book lists deduped by work id, and `workCount` = the larger count; a variant fetch that rejects still returns the primary list; an unresolved subject ("zombies" with no heading) is byte-identical to today's result.
- [x] **Step 2: Verify fail** — `cd apps/server && npx vitest run src/services/subjectService.test.ts`
- [x] **Step 3: Implement.**
- [x] **Step 4: Verify pass**, then the full gate: all workspace tests and typechecks pass.
- [ ] **Step 5: Manual check** — `GET /api/graph/work/OL152258W` shows one "American horror tales" subject node; `GET /api/subjects/horror_tales_american` and `/api/subjects/american_horror_tales` return the same merged subject. Confirm `CACHE_DB_PATH` is set in the production environment so canonical mappings persist across deploys.
- [ ] **Step 6: Commit** — `feat(server): subject pages merge LCSH variant spellings into one page`
