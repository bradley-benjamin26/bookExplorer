# Connection Reliability and UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Find connection" stop giving false "no connection" answers and repeat expensive searches, ship three small UI fixes (English-first editions, a clear-history button, a "View saved edition" button), and add Z39.50 library availability with a way to pick a supported library in Library Settings (Part B).

**Architecture:** Connection work is server-first: `findPath` learns to distinguish "nothing exists" from "a fetch failed", and `/api/path` gains a small in-memory result cache. The client only maps one new failure reason. The three UI items are independent, each touching one screen plus one pure helper so it can be unit-tested.

**Tech Stack:** TypeScript, Fastify, vitest (server and app), Expo Router / React Native, zod (`@book-explorer/shared`), TanStack Query.

**Spec:** none; requirements are the conversation of 2026-11-13. Connection items are items 1 and 2 of the reliability list (items 3 to 5, retrying expansions, resumable or streamed searches and rate-limit tuning, are deliberately out of scope). The three UI items are the user's numbered additions.

## Global Constraints

- Test runner is `npm test` from the repo root (runs `vitest run` in each workspace); one file: `npx vitest run <path>` inside `apps/server` or `apps/app`.
- Tests are written with each change (project preference), failing first.
- Commit steps run only if the user has asked for commits; the branch is `main`, so branch first.
- Copy strings exactly as written in this plan (button labels, messages).
- Do not add dependencies.

## Review Focus

1. Reversed endpoints (B to A after A to B) must not be served A to B's cached path: paths are oriented, and the graph screen centres on `nodes[0]`. Cache key is directional. (Task 2 test.)
2. A search aborted by client disconnect, timed out, capped or hit by upstream trouble must never be cached, or one bad run poisons retries for hours. (Task 2 test.)
3. A fetch that *throws* is a failure; a fetch that returns `null` (an id with no graph) is not. Only failures may turn `noPath` into `incomplete`. (Task 1 tests.)
4. A work whose editions are all unlabeled, or all non-English, still lists every edition, in a stable order, with nothing dropped. (Task 3 test.)
5. Clearing history while a filter chip (for example "Authors") is selected leaves a clean home screen: section gone, no stale filter. (Task 5 step 4.)

## File Structure

| File | Change |
|---|---|
| `packages/shared/src/index.ts` | add `"incomplete"` to the `PathResultSchema` reason enum (line ~306) |
| `apps/server/src/services/graphQuery.ts` | count thrown expansions; report `incomplete` |
| `apps/server/src/services/graphQuery.test.ts` | new tests |
| `apps/server/src/routes/path.ts` | result cache |
| `apps/server/src/routes/path.test.ts` | cache tests |
| `apps/app/src/graphLabels.ts` | message for `incomplete`; `pathRetryable` |
| `apps/app/app/connection.tsx` | use `pathRetryable` for the Try Again button |
| `apps/server/src/editionOrder.ts` (+ test) | three language tiers |
| `apps/server/src/sources/openLibrary.ts` (+ test) | optional second editions page |
| `apps/app/app/index.tsx` | Clear history button |
| `apps/app/app/work/[id].tsx`, `apps/app/src/editionChoice.ts` (+ test) | "View saved edition" button |

---

### Task 1: Report `incomplete` instead of a false `noPath`

**Files:**
- Modify: `packages/shared/src/index.ts:306`, `apps/server/src/services/graphQuery.ts`, `apps/app/src/graphLabels.ts:63`, `apps/app/app/connection.tsx` (the `reason === "timeout"` Try Again condition)
- Test: `apps/server/src/services/graphQuery.test.ts`, `apps/app/src/graphLabels.test.ts` (create if absent)

**Interfaces:**
- Produces: reason `"incomplete"` in `PathResult`; `pathRetryable(reason: Extract<PathResult, { found: false }>["reason"]): boolean` in `graphLabels.ts`, true for `timeout` and `incomplete`.

- [ ] **Step 1: Write failing tests** in `graphQuery.test.ts`, reusing its `fixture`, `LIMITS`, `pathIds` helpers and the `vi.spyOn(console, "warn")` pattern of the existing "treats a failed expansion as a dead end" test:
  - `reports incomplete, not noPath, when an expansion failed and no path was found`: graph `A -wrote-> Bad`, `A -wrote-> W1`, `Bad -wrote-> T`; neighbours rejects for `work:Bad`; expect `{ found: false, reason: "incomplete" }`.
  - `reports incomplete instead of depthCap when an expansion also failed`: a graph that yields `depthCap` today, plus one rejecting node.
  - `still reports noPath when an end simply has no graph`: neighbours resolves `null` for the start; expect `reason: "noPath"` (the existing test at line ~93 already covers this; keep it green).
  - Existing "treats a failed expansion as a dead end and finds the path another way" must still return `found: true`.
  In `graphLabels.test.ts`: `pathRetryable("incomplete")` and `pathRetryable("timeout")` are true; `noPath`, `depthCap`, `nodeCap`, `upstreamUnavailable` are false.
- [ ] **Step 2: Run** `cd apps/server && npx vitest run src/services/graphQuery.test.ts` and `cd apps/app && npx vitest run src/graphLabels.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement.** In `findPath`, a `failedExpansions` counter incremented inside the existing `.catch` in `expand` (not for `null` results). In the final `finish(...)` call inside `pump`, when the chosen reason would be `noPath` or `depthCap` and `failedExpansions > 0`, use `"incomplete"`. `nodeCap`, `timeout` and `upstreamUnavailable` keep their precedence. Add `"incomplete"` to the shared enum. In `graphLabels.ts` add the message `"Some book data couldn't be loaded, so a connection may have been missed. Trying again usually helps."` to `PATH_NOT_FOUND_MESSAGES` and export `pathRetryable`. In `connection.tsx` replace the `reason === "timeout"` condition with `pathRetryable(path.data.reason)`.
- [ ] **Step 4: Run** `npm test` from the repo root, plus `npx tsc --noEmit` in `apps/app` and `apps/server` (the `Record` over reasons makes the compiler flag any missed mapping). Expected: all PASS.
- [ ] **Step 5: Commit** `fix: report incomplete connection searches instead of noPath`.

---

### Task 2: Cache connection results on the server

**Files:**
- Modify: `apps/server/src/routes/path.ts`
- Test: `apps/server/src/routes/path.test.ts` (its module mock replaces `findPath`; keep the cache in the route so the mock still exercises it)

**Interfaces:**
- Consumes: `findPath(from, to, neighbours, limits?, signal?)`, `PathResult` including `incomplete` from Task 1; `TtlCache.get/set` from `apps/server/src/cache.ts`.
- Produces: no new exports; `/api/path` serves a repeated identical `from`/`to` from memory.

- [ ] **Step 1: Write failing tests** in `path.test.ts` (use distinct ids per test; the cache is module-level; `vi.mocked(findPath).mockResolvedValue(...)`):
  - `serves a repeated search from the cache`: found result, two identical requests, `findPath` called once, both bodies equal.
  - `does not serve reversed endpoints from the cache`: A to B then B to A, `findPath` called twice.
  - `caches noPath`: two requests, one `findPath` call.
  - `does not cache timeout, incomplete, nodeCap or upstreamUnavailable`: each reason, two requests, `findPath` called twice.
- [ ] **Step 2: Run** `cd apps/server && npx vitest run src/routes/path.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `path.ts`: `const pathCache = new TtlCache<PathResult>(FOUND_TTL_MS, 2000)` (no namespace, so memory only), key `` `${from}>${to}` `` (directional, after `canonicalNodeId`). Check `get` first and return on hit. On a miss, run `findPath` as now and `set` only when `found` (TTL 6 h) or `reason` is `noPath` or `depthCap` (TTL 1 h). Add `// shortcut: memory only and no in-flight sharing, so a restart or two simultaneous identical searches repeat the work; use TtlCache.wrap with a namespace if that shows up in logs.` Do not use `wrap`: its in-flight sharing would hand one client's abort-triggered `timeout` to another.
- [ ] **Step 4: Run** the file, then `npm test`. Expected: PASS. The 10/min rate limit still applies to cache hits; leave it.
- [ ] **Step 5: Commit** `feat: cache connection search results`.

---

### Task 3: English editions first (three tiers)

**Context:** `orderEditions` already puts English and unlabeled ahead of non-English, but it treats *unlabeled* editions (possible translations) the same as *labelled English* ones, so they interleave by date.

**Files:**
- Modify: `apps/server/src/editionOrder.ts`, `apps/server/src/sources/openLibrary.ts:~177` (the one caller)
- Test: `apps/server/src/editionOrder.test.ts` (locate with `ls`; create if absent)

**Interfaces:**
- Changes: `orderEditions<T extends { english: boolean; nonEnglish: boolean; publishDate: string | null; coverUrl: string | null }>(editions: T[]): T[]`. Tier order: `english`, then unlabeled (neither flag), then `nonEnglish`; within a tier, existing newest-with-cover-boost scoring; stable on ties.

- [ ] **Step 1: Write failing tests:** `ranks labelled English above unlabeled even when the unlabeled one is newer`; `ranks unlabeled above non-English`; `drops nothing and keeps input order for ties when every edition is unlabeled`.
- [ ] **Step 2: Run** `cd apps/server && npx vitest run src/editionOrder.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** a `tier(e)` of 0, 1 or 2 replacing the `nonEnglish` comparison. Existing tests that build items with only `nonEnglish` need `english: false` added.
- [ ] **Step 4: Run** `npm test`. Persisted work caches keep the old order until their TTL ends; no schema bump needed.
- [ ] **Step 5: Commit** `feat: rank labelled English editions first`.

---

### Task 4: Look at a second page of editions when English ones are scarce (optional)

**Context:** `getWorkEditions` reads only the first 50 editions Open Library returns (the `shortcut:` comment at `openLibrary.ts:146`). For popular works with hundreds of editions, English ones beyond 50 can never appear, so ordering alone cannot help. Drop this task if Task 3 satisfies the request.

**Files:**
- Modify: `apps/server/src/sources/openLibrary.ts` (`getWorkEditions`, `OpenLibraryEditionsData` gains `size?: number`)
- Test: no `sources/openLibrary.test.ts` exists. Find the file that mocks `editions.json` with `grep -rln "editions.json" apps/server/src --include='*.test.ts'` (likely `routes/openLibrary.test.ts` or a service test); if none, create `apps/server/src/sources/openLibrary.test.ts` stubbing `fetchWithTimeout` from `../httpClient.js` with `vi.mock`.

**Interfaces:**
- Produces: `EDITIONS_PAGE = 50` and `MIN_ENGLISH_EDITIONS = 10` constants; behaviour: when `size > 50` and fewer than 10 page-1 entries are labelled English, fetch `?limit=50&offset=50` once and rank the combined list. A failure on page 2 is ignored (page-1 results stand).

- [ ] **Step 1: Write failing tests:** `fetches a second page when the first has few English editions and more exist`; `does not fetch a second page when ten or more are English or size <= 50`; `keeps page-one results when the second page fails`.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement** inside `getWorkEditions`, replacing the "only first 50" `shortcut:` comment with one stating the new two-page limit.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: widen the editions window for works with few English editions`.

---

### Task 5: "Clear history" button on the home screen

**Files:**
- Modify: `apps/app/app/index.tsx` (the "Recently looked at" block, ~line 151)
- Test: `apps/app/src/storage/history.test.ts` (add only if absent)

**Interfaces:**
- Consumes: `clearRecent(): Promise<void>` from `storage/history.ts`; `confirmDestructive(title, message, confirmLabel): Promise<boolean>` (same call as `settings.tsx:249`).

- [ ] **Step 1:** No new storage test: `history.test.ts` already has `clearRecent empties the history`. The UI wiring is verified in Step 4.
- [ ] **Step 2: Implement** `clearHistory` in `index.tsx`: `if (!(await confirmDestructive("Clear history?", "Remove everything from your recently viewed list? This can't be undone.", "Clear"))) return; await clearRecent(); setRecent([]); setFilter("all");`.
- [ ] **Step 3: Render** a `Button variant="pill"` labelled `Clear history` (accessibilityLabel `Clear recently looked at history`) below `shown.map(renderRecent)`, inside the `recent.length > 0` block so it disappears with the section.
- [ ] **Step 4: Verify** by running the app on web (`npm run web` in `apps/app`): view two items, select the "Authors" chip, press Clear history, cancel (list stays), press again and confirm (section gone, no stale filter after viewing a new item).
- [ ] **Step 5: Run** `npm test`; **commit** `feat: add clear history button to recently looked at`.

---

### Task 6: "View saved edition" button on the work page

**Files:**
- Modify: `apps/app/app/work/[id].tsx:164-168` and styles `savedEdition`, `savedEditionLink` (delete if unused afterwards), `apps/app/src/editionChoice.ts`
- Test: `apps/app/src/editionChoice.test.ts`

**Interfaces:**
- Produces: `savedEditionLabel(rec: { format: string | null; isbn: string }): string` returning `` `View saved edition: ${format ?? "edition"} ${isbn}` ``, used as the button's `accessibilityLabel`, so the visible text can be short while screen readers still hear which edition.

- [ ] **Step 1: Write failing tests** in `editionChoice.test.ts`: `savedEditionLabel({ format: "Paperback", isbn: "9780141439518" })` equals `View saved edition: Paperback 9780141439518`; with `format: null` it equals `View saved edition: edition 9780141439518`.
- [ ] **Step 2: Run** `cd apps/app && npx vitest run src/editionChoice.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the helper, then replace the `Pressable` link with `<Button variant="pill" onPress={() => router.push(routes.book(savedEdition.isbn))} accessibilityLabel={savedEditionLabel(savedEdition)} tooltip="View the saved edition">View saved edition</Button>`, keeping the `savedEdition &&` guard and a `marginTop: spacing.sm` style. Remove now-unused styles and the `Pressable`/`titleRef` imports only if nothing else in the file uses them.
- [ ] **Step 4: Run** `npm test`; check on web that a work with a saved edition shows the button and it opens the book page.
- [ ] **Step 5: Commit** `feat: make the saved edition link a button`.

---

---

# Part B: Z39.50 library availability

**Goal of Part B:** let a user pick one of the tested Z39.50 libraries in Library Settings and see, on book and work pages, whether that library has the book and (where the server reports it) which copies are on the shelf.

**Approach:** the server owns an allowlisted registry of libraries (host, port, database and how to read its holdings) and shells out to `yaz-client` with a generated command file. The app only ever sends a library id and an ISBN. Z39.50 is raw TCP, so it cannot run in the Expo app.

## Server test results (run 2026-11-13)

Each server was tested with the same checks: connect, anonymous Init, ISBN search (`@attr 1=7`), then `format usmarc`, `elements F`, `show 1`. Servers that missed the first ISBN were retried with a second ISBN, an ISBN-10 and a title search. No server asked for credentials. Raw outputs are in the session scratchpad; Task 8 copies the ones the parsers need into fixtures.

| Server | Result | Registry level |
|---|---|---|
| `catalog.mbln.org:210/pac` | Polaris. 852 fields: branch, call number, status In/Out/Held, due date | `availability` |
| `kcmo.sirsi.net:2500/UNICORN` | SirsiDynix. 926 fields: location, status (only `ON-SHELF` seen), call number | `availability`. Task 8 probe (2026-11-13): saw `CHECKEDOUT` with a due date in `$e` (e.g. 11/16/2026) and `HOLDS` (no date). CHECKEDOUT is evident from the record; `HOLDS` is mapped to `unknown`. Not compared with the web catalog. `sirsi926` enabled |
| `pac.nwrls.lib.fl.us:5666/LSPacZ` | Library.Z. 949 items plus 982 with `$s` A or U; meaning unconfirmed | `catalog`. Task 8 probe: `$s` A (13) and U (5) seen on three bestsellers, no due date or other value, meaning not matchable to the web catalog, so stays `catalog` (holdings `none`) |
| `www.more.lib.wi.us:210/INNOPAC` | record, no holdings fields | `catalog` |
| `catalog.oaklandlibrary.org:210/INNOPAC` | record, 907 (bib number) and 994 only | `catalog` |
| `www.saclibrarycatalog.org:210/INNOPAC` | record, 907 and 932 (call number) | `catalog` |
| `sflib1.sfpl.org:210/INNOPAC` | record, 907, 998, 999 | `catalog` |
| `catalog.brooklynpubliclibrary.org:210/INNOPAC` | record, 907 and 994 | `catalog` |
| `prospector.coalliance.org:210/INNOPAC` | 3 hits (consortium), 907 only | `catalog` |
| `catalog.ecpl.org:210/INNOPAC` | missed ISBN 1, hit ISBN 2 (no holdings fields); title and other ISBN also hit | `catalog` |
| `opac.tulsalibrary.org:210/INNOPAC` | missed the first two ISBNs, hit a third and a title search; record fields not inspected | `catalog`. Task 8 probe: Tulsa hit on 2 of 2 new ISBNs, only a 902 field; no 852/926/945/949 |
| `vera.cals.lib.ar.us:210/INNOPAC` | same as Tulsa. Task 8 probe: hit 1 of 2 ISBNs; the hit has no 852/926/945/949 | `catalog` |
| `viking.sirsi.net:2200/UNICORN` | hits on an ISBN and a title; hostname looks like a vendor demo, fields not inspected | **excluded** unless the user confirms it is a real library |
| `ipac3.vpl.ca:210/DEFAULT` | Horizon. ISBN search returns server error 100; title search works (233 hits) | **excluded** (this app searches by ISBN) |
| `merlin.nwls.lib.wi.us:210/INNOPAC`, `alam1.aclibrary.org:210/INNOPAC`, `www.ci.austin.tx.us:210/UNICORN` | TCP connects, then the server closes the connection on Init, in two separate rounds | **excluded** |

"Innovative" (INNOPAC) servers returned zero hits plus diagnostic 22 ("Result set naming not supported") when a title was simply not in the catalog, so a miss and an error look alike there. A not-found result is therefore never shown to users as "this library doesn't own it": the catalog may hold another edition.

## Review Focus (Part B)

1. An ISBN that is not a valid ISBN (spaces, shell characters, newlines, too long) never reaches the `yaz-client` command file; the route answers 400. (Task 7 and Task 9 tests.)
2. An unknown library id answers 404, and host, port and database are never read from the request. (Task 9 test.)
3. A not-found result renders nothing, never "not available"; a catalog-level hit renders "In the catalog" without claiming a copy is on the shelf. (Task 12 test.)
4. A server that is down, slow (10 s cap) or answers with an Init failure produces a 503 that is not cached, and the UI shows nothing for that library rather than an error banner on every page. (Tasks 9 and 12 tests.)
5. A backup or saved library whose `z3950Id` is no longer in the registry still loads and displays; it is shown as "no longer supported" and keeps its manual URLs. (Tasks 10 and 11 tests.)

### Task 7: Registry and `yaz-client` runner

**Files:**
- Create: `apps/server/src/z3950/registry.ts`, `apps/server/src/z3950/client.ts`
- Test: `apps/server/src/z3950/client.test.ts`

**Interfaces:**
- Produces:
  - `type HoldingsFormat = "polaris852" | "sirsi926" | "none"`
  - `interface Z3950Library { id: string; name: string; host: string; port: number; database: string; holdings: HoldingsFormat }`
  - `Z3950_LIBRARIES: readonly Z3950Library[]` and `getZ3950Library(id: string): Z3950Library | undefined`
  - `buildCommandFile(library: Z3950Library, isbn: string): string` (the `open`, `find @attr 1=7`, `format usmarc`, `elements F`, `show 1`, `quit` lines)
  - `searchByIsbn(library: Z3950Library, isbn: string, signal?: AbortSignal): Promise<string>` returning yaz-client's text output; rejects with `Z3950UnavailableError` on spawn failure, a 10 s timeout, "Target closed connection" or an Init that was not accepted.

- [ ] **Step 1: Write failing tests** in `client.test.ts` with an injected runner so no process or network is used: `buildCommandFile` contains exactly the six lines in order with the library's host, port and database; `searchByIsbn` rejects with `Z3950UnavailableError` for output containing `Target closed connection`; it rejects for an ISBN that fails `isValidIsbn` before any process starts (input `"9780141439518; rm -rf /"` and `"978014143951\n8"`); it normalizes a hyphenated ISBN to digits.
- [ ] **Step 2: Run** `cd apps/server && npx vitest run src/z3950/client.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Registry entries use the rows in the results table with level `catalog` or `availability`; set `holdings` to `polaris852` for MBLN, and `none` for everything else for now (Task 8 enables `sirsi926` after its probe). Display names are guesses from hostnames (Metropolitan Boston Library Network, Kansas City, Northwest Regional Library System FL, MORE Libraries WI, Oakland Public Library, Sacramento Public Library, San Francisco Public Library, Brooklyn Public Library, Prospector (Colorado),East Chicago Public Library, Tulsa City-County Library, Central Arkansas Library System): **the user confirms the names before this task is finished**. `searchByIsbn` writes the command file to a fresh temp file, runs `yaz-client -f <file>` with `execFile` (no shell), kills it after 10 000 ms, always deletes the file, and allows at most 4 runs at once (`shortcut: in-process semaphore, assumes one server process`).
- [ ] **Step 4: Run** the file, then `npm test`. Expected: PASS. Also run `which yaz-client` on the machine that hosts the server; if it is absent, the host's install steps (YAZ package) go in the deploy docs as part of this task.
- [ ] **Step 5: Commit** `feat: add Z39.50 library registry and yaz-client runner`.

### Task 8: Holdings parsers, with a probe before enabling any

**Files:**
- Create: `apps/server/src/z3950/parse.ts`, `apps/server/src/z3950/fixtures/{mbln,kcmo,nwrls}.txt` (copied from the scratchpad `raw_*` files), `apps/server/src/z3950/fixtures/<one per catalog-level server>.txt`
- Test: `apps/server/src/z3950/parse.test.ts`

**Interfaces:**
- Consumes: `HoldingsFormat` from Task 7.
- Produces:
  - `type CopyStatus = "available" | "checkedOut" | "unavailable" | "unknown"`
  - `interface Copy { branch: string; callNumber: string | null; status: CopyStatus; dueDate: string | null }`
  - `parseRecord(output: string, format: HoldingsFormat): { found: boolean; copies: Copy[] }`. `found` is true when the output has `Record type` or at least one MARC line; copies are empty for `none`.
  - `polaris852`: `$a` branch, `$h` call number, `$r` In to `available`, Out to `checkedOut`, Held to `unavailable`, anything else to `unknown`; `$u` is the due date.
  - `sirsi926`: `$a` location, `$c` call number, `$b` `ON-SHELF` to `available`; other codes per the probe below.

- [ ] **Step 1: Probe first (no code).** Using the `yaz-client` sequence from Task 7, (a) search KCMO and NWRLS for a recently published bestseller likely to be checked out, and record the `$b` values (KCMO) and `$s` values (NWRLS) seen next to a copy the library's own web catalog shows as checked out; (b) run `elements F` on Tulsa, Arkansas and every other `catalog` server and record any 852, 926, 945 or 949 fields, so the registry level reflects what they really return. Write the findings into this plan's results table. A server whose status codes cannot be matched to the web catalog stays `catalog`.
- [ ] **Step 2: Write failing tests** in `parse.test.ts`: the MBLN fixture gives 15 copies, 5 `available`, 2 `unavailable`, 8 `checkedOut`, and every `checkedOut` copy has a non-null `dueDate`; the KCMO fixture's `ON-SHELF` rows are `available`; a fixture with `Number of hits: 0` and no record gives `{ found: false, copies: [] }`; a catalog-level fixture gives `found: true` and `copies: []`; a copy with an unrecognised status code gives `unknown`, never `available`.
- [ ] **Step 3: Run** `cd apps/server && npx vitest run src/z3950/parse.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** `parseRecord`, a line scanner over yaz-client's text (`^(\d{3}) .. ` then `$x` subfields), not an ISO 2709 reader. Then set each registry entry's `holdings` only for formats the probe verified.
- [ ] **Step 5: Run** `npm test`; **commit** `feat: parse Z39.50 holdings`.

### Task 9: Availability service and routes

**Files:**
- Create: `apps/server/src/services/libraryAvailability.ts`, `apps/server/src/routes/libraries.ts`
- Modify: `packages/shared/src/index.ts` (schemas), the server's route registration in `apps/server/src/index.ts`
- Test: `apps/server/src/services/libraryAvailability.test.ts`, `apps/server/src/routes/libraries.test.ts`

**Interfaces:**
- Consumes: `searchByIsbn`, `getZ3950Library`, `Z3950_LIBRARIES` (Task 7); `parseRecord` (Task 8).
- Produces:
  - shared `SupportedLibrarySchema = { id: string; name: string; level: "availability" | "catalog" }` and `LibraryAvailabilitySchema = { found: boolean; level: "availability" | "catalog"; copies: Copy[] }` (with `Copy` as in Task 8)
  - `getLibraryAvailability(libraryId: string, isbn: string, signal?: AbortSignal): Promise<LibraryAvailability | null>` (null for an unknown id)
  - `GET /api/libraries` returns `SupportedLibrary[]`; `GET /api/libraries/:id/availability?isbn=` returns `LibraryAvailability`

- [ ] **Step 1: Write failing tests:** service caches a result for 2 minutes and does not cache a thrown `Z3950UnavailableError`; unknown id gives `null` and runs no search; route answers 400 for the invalid ISBNs of Task 7, 404 for an unknown id, 503 with `{ error: "This library's catalog is temporarily unavailable." }` when the service throws `Z3950UnavailableError`, and 200 matching `LibraryAvailabilitySchema` otherwise; `GET /api/libraries` lists every registry entry with its level and no host or port.
- [ ] **Step 2: Run** the two files. Expected: FAIL.
- [ ] **Step 3: Implement.** Cache with `new TtlCache<LibraryAvailability>(120_000, 500)` keyed `` `${id}:${isbn}` `` (memory tier only). Rate limit the availability route to 30 per minute. Level is the registry entry's: `availability` only when its `holdings` is not `none`.
- [ ] **Step 4: Run** the files, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add library availability endpoints`.

### Task 10: Library model, backup schema and "configured"

**Files:**
- Modify: `apps/app/src/storage/librarySettings.ts` (`Library`, `isConfigured`), `packages/shared/src/index.ts` (`LibraryExportSchema`)
- Test: `apps/app/src/storage/librarySettings.test.ts`, the existing snapshot or backup test that covers libraries

**Interfaces:**
- Produces: `Library.z3950Id?: string`; `LibraryExportSchema` gains `z3950Id: z.string().max(100).optional()` (no schema version bump; old backups stay valid).

- [ ] **Step 1: Write failing tests:** a library with a `z3950Id` and blank URLs counts as configured (`getConfiguredLibraries` returns it); `upsertLibrary` accepts it; a snapshot export and re-import keeps `z3950Id`; a library without one is unchanged.
- [ ] **Step 2: Run** `cd apps/app && npx vitest run src/storage`. Expected: FAIL.
- [ ] **Step 3: Implement** the field, the `isConfigured` check (`|| !!library.z3950Id`) and the schema line.
- [ ] **Step 4: Run** `npm test` from the repo root. Expected: PASS.
- [ ] **Step 5: Commit** `feat: allow a library to reference a Z39.50 catalog`.

### Task 11: "Add a supported library" in Library Settings

**Files:**
- Create: `apps/app/src/libraryOptions.ts`
- Modify: `apps/app/app/settings.tsx` (the library section near the "Add new library" row, ~line 318; `LibraryCard`), `apps/app/src/api/client.ts` (`fetchSupportedLibraries`)
- Test: `apps/app/src/libraryOptions.test.ts`

**Interfaces:**
- Consumes: `SupportedLibrary` (Task 9), `Library` (Task 10), `upsertLibrary`, `generateLibraryId`.
- Produces: `fetchSupportedLibraries(): Promise<SupportedLibrary[]>`; `supportedLibraryOptions(supported: SupportedLibrary[], libraries: Library[]): SupportedLibrary[]`, which omits ones already added (matched on `z3950Id`).

- [ ] **Step 1: Write failing tests:** `supportedLibraryOptions` omits a library whose id is already a `z3950Id`, keeps the rest in registry order, and returns all of them for an empty list.
- [ ] **Step 2: Run** `cd apps/app && npx vitest run src/libraryOptions.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the helper and the client call. In `settings.tsx`, add a pill `Button` labelled `Add a supported library` below the "Add new library" row. It opens a list of the options; choosing one calls `upsertLibrary({ id: generateLibraryId(), name, isbnUrl: "", titleUrl: "", z3950Id })` and reloads. When the list fails to load, show "Couldn't load libraries. Try again." In `LibraryCard`, for a library with a `z3950Id`, add one read-only line under the name: `Checks live availability` for level `availability`, `Checks whether the catalog has the book` for `catalog`, and `This library is no longer supported. Your saved links still work.` when the id is not in the fetched list; the URL fields stay editable.
- [ ] **Step 4: Run** `npm test`; check on web that a library can be added, appears on the card, and can be removed.
- [ ] **Step 5: Commit** `feat: add supported libraries in settings`.

### Task 12: Availability on book and work pages

**Files:**
- Create: `apps/app/src/libraryAvailability.ts`, `apps/app/src/components/LibraryAvailability.tsx`
- Modify: `apps/app/src/components/LibraryFindLinks.tsx`, `apps/app/src/api/client.ts` (`fetchLibraryAvailability`)
- Test: `apps/app/src/libraryAvailability.test.ts`

**Interfaces:**
- Consumes: `LibraryAvailability` (Task 9), `Library.z3950Id` (Task 10).
- Produces: `fetchLibraryAvailability(libraryId: string, isbn: string, signal?: AbortSignal): Promise<LibraryAvailability>`; `availabilityLine(a: LibraryAvailability): string | null` returning `null` when `!a.found`, `"In the catalog"` for a found catalog-level result, and for copies `"3 of 15 copies available"`, or `"No copies on the shelf. Next due Nov 25"` when none are available and at least one has a due date (the earliest), or `"No copies on the shelf"` otherwise.

- [ ] **Step 1: Write failing tests:** the four `availabilityLine` cases above, plus `unknown`-status copies are not counted as available.
- [ ] **Step 2: Run** `cd apps/app && npx vitest run src/libraryAvailability.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the helper and the client call, then `LibraryAvailability`: a `useQuery(["libraryAvailability", id, isbn])` with `staleTime: 60_000`, `retry: false`, enabled only when `isbn` is present, rendering `availabilityLine` as a quiet text row under that library's "Find at" links, and nothing on error, loading or `null`. Render it from `LibraryFindLinks` for each library with a `z3950Id`. A work page passes its `isbn` field, which is the first edition's ISBN; add `// shortcut: one ISBN per lookup, so a library holding only another edition reads as not found; try the work's other edition ISBNs if that shows up.`
- [ ] **Step 4: Run** `npm test`; check on web that MBLN shows counts for the *Pride and Prejudice* ISBN `9780141439518`.
- [ ] **Step 5: Commit** `feat: show library availability on book pages`.

---

## Self-review

- **Coverage:** connection items 1 and 2 → Tasks 1 and 2; UI additions 1, 2, 3 → Tasks 3 (+4), 5, 6.
- **Types:** `incomplete` is added to the shared enum in Task 1 and relied on in Task 2's tests; `pathRetryable` is defined in Task 1 only; `orderEditions` gains `english` in Task 3 and its single caller already has the field.
- **Part B coverage:** every server in `docs/z39servers.txt` was tested and appears in the results table; Tasks 7 to 9 are server, 10 is the model, 11 is the Settings option, 12 is the page display. Types match across tasks: `Copy` and `CopyStatus` (Task 8) feed `LibraryAvailabilitySchema` (Task 9) and `availabilityLine` (Task 12); `Library.z3950Id` (Task 10) is what Tasks 11 and 12 read.
- **Assumptions to confirm:** (a) "these" meant connection items 1 and 2 only; (b) "prioritize English in view more editions" is interpreted as English-first ordering of the whole editions list, since the "+N more" collapse hides only self-published editions and keeps order; (c) the library display names in Task 7 are guesses from hostnames; (d) the production host can install YAZ.
