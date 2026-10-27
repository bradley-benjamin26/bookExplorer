# Connection Search Timeouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Find a connection" finish within its 25 s budget on a cold cache, instead of timing out on about 2 searches in 3.

**Architecture:** The path search (`apps/server/src/services/graphQuery.ts`) expands each book node through `getWorkDetail`. That function builds the whole Work page: Open Library work, author names and editions, LOC subjects, Hardcover reviews, Open Library ratings, Wikidata genres and series, and "more by this author". The search uses only the book's authors, subjects and genres. Every Open Library call also waits in one shared queue limited to 3 requests a second (`apps/server/src/httpClient.ts:17`), so a cold book costs about 5 Open Library calls, and 25 s only covers about 15 books, not the ~80 expansions `MAX_EXPANSIONS` assumes. The fix follows the existing `buildSubjectBooksGraph` precedent: give the search a cut-down work lookup that makes 1 + (one per author) Open Library calls, and reuse the full work whenever it is already cached. The app also gets a "Try Again" button on timeout, since a retry starts with everything the first attempt fetched already cached.

**Tech Stack:** Fastify + TypeScript server, vitest; Expo SDK 57 app (read https://docs.expo.dev/versions/v57.0.0/ per `apps/app/AGENTS.md`).

**Spec:** No separate spec. The diagnosis above, from reading `graphQuery.ts`, `graphService.ts`, `workService.ts`, `authorService.ts` and `httpClient.ts` on 2026-10-26. Task 1 confirms it with real numbers before anything else changes.

## Global Constraints

- Do not raise the per-host limits in `httpClient.ts` (`openlibrary.org`: 3 requests a second, 4 at once). Exceeding them risks Open Library blocking the server for longer.
- Do not change `PATH_TIME_BUDGET_MS` (25 s). The app's copy ("can take up to 25 seconds") depends on it.
- The Work and Author pages must look exactly the same as before. Only path search uses the lighter lookups, and a lighter result must never be written to `workCache` or `authorCache`.
- `UpstreamUnavailableError` must reach `findPath` unchanged, so its `upstreamUnavailable` early exit keeps working.
- No new dependencies.
- After each task, run from `apps/server`: `npx tsc --noEmit` and `npm test`. For Task 4, run the same from `apps/app`.

## Review Focus

1. **Book already open in the full view:** if someone viewed the book's page within the last hour, path search must use that full work, including LCSH subjects and Wikidata genres, so those links aren't lost. Test in Task 2.
2. **Open Library cooling down:** the lighter lookup must throw `UpstreamUnavailableError`, not swallow it, so the search stops with "temporarily unavailable" instead of burning 25 s. Test in Task 2.
3. **"genre:"-prefixed Open Library subjects:** they must still become `genre:` nodes in the lighter graph, not subjects reading "genre:science fiction". Test in Task 2.
4. **Lighter work then full page:** opening a book's page after a search must still show editions, rating and reviews. In other words, the lighter result never fills `workCache`. Test in Task 2.
5. **Retrying past the rate limit:** `/api/path` allows 10 requests a minute. "Try Again" after a 429 must show the error text and must not loop. Manual check in Task 4.

---

### Task 1: Log each search's outcome and take a baseline

**Files:**
- Modify: `apps/server/src/services/graphQuery.ts` (`findPath`'s `finish`)

**Interfaces:**
- Produces: one `console.info` line per finished search, used by Task 2's re-measure:
  `[graphQuery] <from> -> <to>: <N path(s) | reason> after <expansions> expansions in <ms> ms`

- [ ] **Step 1: Add the log line.** In `findPath`, record `const started = Date.now()` beside `expansions`. In `finish`, after `finished = true`, print the line above. `reason` is the `found: false` reason, used only when `found` is empty. No test: this is a log line.
- [ ] **Step 2: Run the server cold.** From `apps/server`: `CACHE_DB_PATH= npm run dev` (port 3001, empty memory cache, no persistent cache).
- [ ] **Step 3: Time the pairs that timed out in the app.** Send each one once with
  `curl -s "http://localhost:3001/api/path?from=<from>&to=<to>" -o /dev/null -w "%{time_total}\n"`
  (ids look like `work:OL45883W`; no `X-App-Key` header is needed while `APP_SHARED_SECRET` is empty in `apps/server/.env`). Note each line Step 1 printed.
  Expected, if the diagnosis holds: timeouts after roughly 15–30 expansions, not ~80.
  If the searches instead end with `nodeCap` or `depthCap`, stop: the cause is different, and Task 2 won't fix it.
- [ ] **Step 4: Commit**

```bash
git add apps/server/src/services/graphQuery.ts
git commit -m "Log each path search's outcome, expansion count and duration"
```

### Task 2: Lighter work lookup for path search (the main fix)

**Files:**
- Modify: `apps/server/src/sources/openLibrary.ts:230` (`getWork`)
- Modify: `apps/server/src/services/workService.ts`
- Modify: `apps/server/src/services/graphService.ts:243-309` (`buildWorkGraph`)
- Modify: `apps/server/src/services/graphQuery.ts:5-13` (constants comment and values), `:54` (`graphNeighbours`)
- Test: `apps/server/src/services/workService.test.ts` (new), `apps/server/src/services/graphService.test.ts`, `apps/server/src/services/graphQuery.test.ts`

**Interfaces:**
- Consumes: Task 1's log line, for the re-measure.
- Produces:
  - `getWork(workId: string, { editions = true }: { editions?: boolean } = {}): Promise<OpenLibraryWork | null>`. With `editions: false` it skips `getWorkEditions`, and `editions` and `isbnCandidates` are `[]`.
  - `export type WorkLinks = Pick<Work, "openLibraryWorkId" | "title" | "authors" | "subjects" | "genres" | "editions">` in `workService.ts`.
  - `export function getWorkLinks(workId: string): Promise<WorkLinks | null>`. Returns `workCache.get(workId)` when present. Otherwise returns the cached result of `openLibrary.getWork(workId, { editions: false })` in its own `TtlCache<WorkLinks | null>(1000 * 60 * 60, 1000, "workLinks")`, with `subjects: mergeTaggedTerms({ source: "openLibrary", labels: ol.subjects })`, `genres: []` and `editions: []`.
  - `export async function buildWorkLinksGraph(workId: string): Promise<Graph | null>` in `graphService.ts`. `buildWorkGraph`'s body moves into a private `workGraph(work: WorkLinks): Graph` that both functions call, the same way `subjectGraph` serves both subject builders.

- [ ] **Step 1: Write the failing tests.**

  `workService.test.ts`: mock `../sources/openLibrary.js` (`getWork`), `../sources/wikidata.js` and `./bookEnrichment.js`. `startCommonEnrichment` resolves LOC to `{ subjects: ["Fathers and sons"], genres: [] }` and the rest to `null`; `findWorkQid` and `fetchMoreByAuthor` return `null`. `getWork` returns a work titled "Dune" with one author and `subjects: ["Desert", "genre:Science Fiction"]`. Use a different work id in each test, because the caches are module-level.

  ```ts
  it("fetches only the Open Library work record, without editions", async () => {
    const links = await getWorkLinks("OL1W");
    expect(openLibrary.getWork).toHaveBeenCalledWith("OL1W", { editions: false });
    expect(startCommonEnrichment).not.toHaveBeenCalled();
    expect(links?.subjects.map((s) => s.label)).toEqual(["Desert", "genre:Science Fiction"]);
    expect(links?.editions).toEqual([]);
  });

  it("reuses a fully loaded work when one is already cached", async () => {
    await getWorkDetail("OL2W");
    const links = await getWorkLinks("OL2W");
    expect(openLibrary.getWork).toHaveBeenCalledTimes(1);
    expect(links?.subjects.map((s) => s.label)).toContain("Fathers and sons");
  });

  it("never stands in for the full work on the work page", async () => {
    await getWorkLinks("OL3W");
    await getWorkDetail("OL3W");
    expect(startCommonEnrichment).toHaveBeenCalledTimes(1);
  });

  it("lets an Open Library cooldown through", async () => {
    vi.mocked(openLibrary.getWork).mockRejectedValueOnce(new UpstreamUnavailableError("openlibrary.org", 60_000));
    await expect(getWorkLinks("OL4W")).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
  ```

  `graphService.test.ts`: mock `./workService.js` so `getWorkLinks` returns the Dune links above, plus `genres: []` and `editions: []`.

  ```ts
  it("builds a work's links graph with 'genre:' subjects as genre nodes and no editions node", async () => {
    const graph = await buildWorkLinksGraph("OL1W");
    expect(graph?.nodes.map((n) => n.id)).toEqual(["work:OL1W", "author:OL2A", "subject:desert", "genre:science_fiction"]);
  });
  ```

  `graphQuery.test.ts`: add `buildWorkLinksGraph: vi.fn()` to the `./graphService.js` mock. Switch the existing "renames a centre…" test from `buildWorkGraph` to `buildWorkLinksGraph`, and add:

  ```ts
  it("opens a work through its links only, without the enrichment lookups", async () => {
    vi.mocked(buildWorkLinksGraph).mockResolvedValue({ centerId: "work:OL1W", nodes: [/* the work node */], edges: [] });
    await graphNeighbours("work:OL1W");
    expect(buildWorkLinksGraph).toHaveBeenCalledWith("OL1W");
    expect(buildWorkGraph).not.toHaveBeenCalled();
  });
  ```

- [ ] **Step 2: Run them and see them fail.** From `apps/server`: `npx vitest run src/services/workService.test.ts src/services/graphService.test.ts src/services/graphQuery.test.ts`. Expected: FAIL, because `getWorkLinks` and `buildWorkLinksGraph` aren't exported yet.
- [ ] **Step 3: Implement** the `getWork` option, `WorkLinks`, `getWorkLinks`, `workGraph` / `buildWorkLinksGraph`, and `work: buildWorkLinksGraph` in `graphNeighbours`'s builder map. `getWorkLinks` must not catch errors. `workCache.get` checks only the memory tier; mark that with `// shortcut: a work only in the persistent tier gets the lighter lookup; read that tier too if paths miss LCSH links after restarts`.
- [ ] **Step 4: Run the tests and see them pass.** Run the same command, then the full `npm test` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Re-measure.** Repeat Task 1 Steps 2–3 on the same pairs. Expected: each search finishes, or uses at least 2× the expansions in the same time. Record expansions per second.
- [ ] **Step 6: Re-tune the constants.** In `graphQuery.ts:5-13`, replace the "Measured cold…" comment with the numbers from Step 5, including that they were measured under the shared 3-requests-a-second Open Library limit. Set `MAX_EXPANSIONS` to the expansions measured in 25 s, rounded down to a multiple of 10, and `MAX_VISITED_NODES` to 15 × that, matching the existing "~15 new nodes per expansion" rule. Re-run `npm test`, which uses its own `LIMITS`, so it should still pass.
- [ ] **Step 7: Commit**

```bash
git add apps/server/src/sources/openLibrary.ts apps/server/src/services/workService.ts apps/server/src/services/workService.test.ts apps/server/src/services/graphService.ts apps/server/src/services/graphService.test.ts apps/server/src/services/graphQuery.ts apps/server/src/services/graphQuery.test.ts
git commit -m "Path search opens works through a lighter lookup; re-tune its limits"
```

### Task 3: Lighter author lookup (only if Task 2's re-measure still times out)

Skip this task if every pair from Task 1 finishes after Task 2. The saving is smaller: `getAuthorDetail` makes one Open Library call the graph doesn't need ("more by this author") and one Wikipedia call.

**Files:**
- Modify: `apps/server/src/services/authorService.ts`
- Modify: `apps/server/src/services/graphService.ts:122-205` (`buildAuthorGraph`)
- Modify: `apps/server/src/services/graphQuery.ts:54`
- Test: `apps/server/src/services/authorService.test.ts` (new), `apps/server/src/services/graphQuery.test.ts`

**Interfaces:**
- Produces:
  - `export type AuthorLinks = Pick<Author, "openLibraryId" | "name" | "relations" | "pseudonyms">`.
  - `export function getAuthorLinks(openLibraryId: string): Promise<AuthorLinks | null>`. Returns `authorCache.get(id)` when present. Otherwise it makes the same Open Library author, Wikidata QID, relations and pseudonyms calls as `getAuthorDetail`, without `fetchMoreByAuthor` or `fetchWikipediaExtract`, cached in its own `TtlCache` with a 24 h TTL and the name `"authorLinks"`.
  - `export async function buildAuthorLinksGraph(openLibraryId: string): Promise<Graph | null>`. `buildAuthorGraph`'s body after the `getAuthorDetail` call moves into a private `authorGraph(author: AuthorLinks): Promise<Graph>` that both use.

- [ ] **Step 1: Write the failing tests**, mirroring Task 2's `workService.test.ts`: `"fetches no Wikipedia extract or more-by-author list"` (`fetchWikipediaExtract` and `fetchMoreByAuthor` not called), `"reuses a fully loaded author when one is already cached"`, and `"lets an Open Library cooldown through"`. In `graphQuery.test.ts`, add `"opens an author through its links only"` (calls `buildAuthorLinksGraph`, not `buildAuthorGraph`).
- [ ] **Step 2: Run them and see them fail.** `npx vitest run src/services/authorService.test.ts src/services/graphQuery.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces, and set `author: buildAuthorLinksGraph` in `graphNeighbours`.
- [ ] **Step 4: Run the tests and see them pass.** Run the full `npm test` and `npx tsc --noEmit`. Expected: PASS. Re-measure as in Task 2 Step 5.
- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/authorService.ts apps/server/src/services/authorService.test.ts apps/server/src/services/graphService.ts apps/server/src/services/graphQuery.ts apps/server/src/services/graphQuery.test.ts
git commit -m "Path search opens authors through a lighter lookup"
```

### Task 4: "Try Again" when a search runs out of time

**Files:**
- Modify: `apps/app/src/graphLabels.ts:65` (`PATH_NOT_FOUND_MESSAGES.timeout`)
- Modify: `apps/app/app/connection.tsx:113-115`

**Interfaces:**
- Consumes: the existing `path` query (`retry: false`, `staleTime: Infinity`). A manual `path.refetch()` still runs.

- [ ] **Step 1: Change the copy.** Set `timeout` to `"The search ran out of time before it found a connection. Trying again usually gets further."`
- [ ] **Step 2: Add the button.** Under the not-found hint, when `path.data.reason === "timeout"`, render `<Button variant="primary" onPress={() => path.refetch()} style={styles.action} accessibilityLabel="Try the search again">Try Again</Button>`. While `path.isFetching`, show `SEARCHING_MESSAGE` and hide the button. `isLoading` stays false on a refetch, so the existing spinner block needs `path.isFetching` too. The screen reader announcement effect keys off `path.isLoading`; switch it to `path.isFetching` so a retry is announced. No unit test: the app has no screen tests, and this is wiring around existing pieces.
- [ ] **Step 3: Manual check.** Point the app at a local server with `PATH_TIME_BUDGET_MS` temporarily set to `1_000` (revert after). Pick a pair, see the timeout message and Try Again, press it, and see the spinner and announcement. Press it 10 more times inside a minute and see the 429 error text show once, with no automatic retry (Review Focus 5).
- [ ] **Step 4: Verify.** From `apps/app`: `npx tsc --noEmit` and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/app/src/graphLabels.ts apps/app/app/connection.tsx
git commit -m "Connection: offer Try Again when a search runs out of time"
```
