# Ponytail Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every finding from the two 2026-11-12 ponytail audits: one data-loss bug and one security hole, plus the robustness, test and wording issues.

**Architecture:** Every fix is small and lives in the module the audit names. There are no new layers and no new dependencies. Server fixes are Tasks 1-6 and app fixes are Tasks 7-13. Task 6 (sign-in CSRF) changes both server and app and must ship as one unit.

**Tech Stack:** Fastify 5 + node:sqlite (server), Expo 57 / React Native + AsyncStorage (app), zod (shared schemas), vitest (both).

**Spec:** The two ponytail audit reports in the 2026-11-12 session. Audit 1 covered the server and backup code (findings A1-A7). Audit 2 covered screens, list sync, CSV and editions (findings B1-B7). Each task quotes the finding it fixes.

## Global Constraints

- No new npm dependencies. In particular, no `@fastify/cookie`: parse the one cookie by hand.
- Node >= 22.13. The server uses `node:sqlite` `DatabaseSync`, which is synchronous.
- `SnapshotExportSchema` in `packages/shared/src/index.ts` must stay the same type as the app's `Snapshot`. The compile-time `Same<>` check in `apps/app/src/backup.ts:12-14` enforces this.
- User-facing copy is plain English, with no exclamation marks, in the style of `confirm.ts`.
- Run tests per workspace: `cd apps/server && npx vitest run <file>` and `cd apps/app && npx vitest run <file>`. The full gate is `npm run typecheck && npm test` from the repo root.
- Commit after each task. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Sign-in started in one browser and finished in another** (for example, a phone opens the link a laptop started). This must fail with the "expired" message, never sign in. The test is in Task 6.
2. **A book removed locally, then re-added locally before the next sync.** Sync must keep it, not delete it on Hardcover. The test is in Task 9.
3. **A book removed locally that the user later adds back on hardcover.app.** After one sync settles the removal, later syncs must not delete it again. The test is in Task 9.
4. **Restore fails on the very first key.** The rollback must not throw a second error that hides the first. The test is in Task 7.
5. **A Hardcover list whose name is only spaces.** Import must still succeed, using a fallback name. The test is in Task 12.

---

### Task 1: Release unread 5xx bodies before retrying (A5)

**Files:**
- Modify: `apps/server/src/httpClient.ts:194-196`
- Test: `apps/server/src/httpClient.test.ts`

**Interfaces:**
- Consumes: none
- Produces: none (behaviour only)

- [ ] **Step 1: Write the failing test** `it("cancels a retried 5xx response's body")`. The first mocked response is `{ ok: false, status: 500, body: { cancel: vi.fn(async () => {}) } }` and the second is `mockResponse(200)`. Assert `res.status === 200` and that the first body's `cancel` was called exactly once. Use fake timers or accept the 300 ms retry delay, as the neighbouring retry tests do.
- [ ] **Step 2: Run** `cd apps/server && npx vitest run src/httpClient.test.ts`. Expected: the new test FAILS (cancel not called).
- [ ] **Step 3: Implement.** Just before `lastError = new Error(...)` (the retry path only, never the returned response), add `await res.body?.cancel().catch(() => {});`.
- [ ] **Step 4: Run the same command.** Expected: all PASS.
- [ ] **Step 5: Commit** `fix(server): release retried 5xx response bodies`

### Task 2: Remember "not on Hardcover" for 10 minutes, not 7 days (A3)

**Files:**
- Modify: `apps/server/src/sources/hardcoverUser.ts:16-28`
- Test: `apps/server/src/sources/hardcoverUser.test.ts`

**Interfaces:**
- Consumes: `TtlCache.wrap(key, fetcher(entry: { ttlMs: number }))`. The fetcher may lower `entry.ttlMs`.
- Produces: `export const MISSING_BOOK_TTL_MS = 10 * 60_000` in `hardcoverUser.ts`.

- [ ] **Step 1: Write the failing test** `it("findBookId forgets a miss after MISSING_BOOK_TTL_MS but keeps a hit")`. Use fake timers and ISBN keys not used elsewhere in the file (`["M1"]` for the miss, `["H1"]` for the hit). The miss returns `{ editions: [] }` and the hit returns `{ editions: [{ book_id: 9 }] }`. Call each once, advance time by `MISSING_BOOK_TTL_MS + 1`, then call each again. Assert the miss key queried `gql` twice and the hit key once.
- [ ] **Step 2: Run** `cd apps/server && npx vitest run src/sources/hardcoverUser.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** In the `wrap` fetcher, take `entry` and set `entry.ttlMs = MISSING_BOOK_TTL_MS` when `id == null`.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit** `fix(server): cache Hardcover book-id misses for 10 minutes`

### Task 3: Pin the scan-path parser with a test (A4)

**Files:**
- Create: `apps/server/src/sources/openLibraryIsbn.test.ts`
- Modify: `apps/server/src/sources/openLibrary.ts` only if a test exposes a real bug. Report any such bug in the commit message.

**Interfaces:**
- Consumes: `lookupByIsbn(isbn: string): Promise<OpenLibraryResult | null>`. It fetches `…/api/volumes/brief/isbn/<isbn>.json`, then `https://openlibrary.org<data.key>.json` for `works[0].key` and `physical_format`.
- Produces: none

- [ ] **Step 1: Write the tests**, stubbing `fetch` by URL the way `openLibraryWork.test.ts` does (`vi.stubGlobal("fetch", …)` and `vi.unstubAllGlobals()` in `afterEach`). Call `resetUpstreamState()` from `../httpClient.js` in `beforeEach` so the host limiter starts fresh.
  - `it("maps a brief record")`: the record `data` has `key: "/books/OL1M"`, `title: "Dune"`, `authors: [{ url: "https://openlibrary.org/authors/OL79034A/Frank_Herbert", name: "Frank Herbert" }]`, `subjects: [{ name: "Science fiction", url: "x" }]` and `cover: { medium: "m.jpg" }`. The edition JSON is `{ works: [{ key: "/works/OL893415W" }], physical_format: "Paperback" }`. Expect `title: "Dune"`, `authors: [{ openLibraryId: "OL79034A", name: "Frank Herbert" }]`, `subjects: ["Science fiction"]`, `coverUrl: "m.jpg"`, `workId: "OL893415W"`, `editionId: "OL1M"` and `format: "Paperback"`.
  - `it("reads notes given as a string or as { value }, and strips the trailer")`. Case 1: `notes: "Good.\r\n----------\r\nSource: x"` gives `description: "Good."`. Case 2: `notes: { value: "Plain" }` gives `"Plain"`.
  - `it("returns null when records is empty")`: `{ records: {} }` gives `null`.
  - `it("keeps the book when the edition lookup fails")`: the edition URL answers `{ ok: false, status: 404 }`. Expect `workId: null`, `format: null`, and the title still mapped.
- [ ] **Step 2: Run** `cd apps/server && npx vitest run src/sources/openLibraryIsbn.test.ts`. Expected: PASS. If one fails, the parser is wrong: fix it in `openLibrary.ts` and say so in the commit.
- [ ] **Step 3: Commit** `test(server): pin Open Library ISBN lookup parsing`

### Task 4: Retry saving refreshed Hardcover tokens once (A6)

**Files:**
- Modify: `apps/server/src/services/hardcoverAccount.ts:66-71` (`refresh`)
- Test: `apps/server/src/services/hardcoverAccount.test.ts`

**Interfaces:**
- Consumes: `updateTokens(sessionToken: string, t: HardcoverTokens): void` from `accountStore.ts`. It is synchronous and may throw.
- Produces: none

- [ ] **Step 1: Make `updateTokens` spy-able in the test file.** Add `vi.mock("../accountStore.js", async () => { const a = await vi.importActual<typeof import("../accountStore.js")>("../accountStore.js"); return { ...a, updateTokens: vi.fn(a.updateTokens) }; })`.
- [ ] **Step 2: Write the failing test** `it("retries a failed token save once before giving up")`. Create a session whose `expiresAt` is within `REFRESH_MARGIN_MS` and make `oauth.refreshTokens` resolve `tokens(2)`. Make `updateTokens` throw once via `mockImplementationOnce(() => { throw new Error("SQLITE_BUSY"); })`. Expect `userAuthorization(token)` to resolve `"Bearer hc_at_2"` and `getSession(token)!.refreshToken === "hc_rt_2"`.
- [ ] **Step 3: Run** `cd apps/server && npx vitest run src/services/hardcoverAccount.test.ts`. Expected: FAIL (the rejection propagates).
- [ ] **Step 4: Implement.** In `refresh`, call `updateTokens` inside `try`. On failure, call it once more and let a second failure throw. Add a one-line comment saying why: the old refresh token is already spent.
- [ ] **Step 5: Run again.** Expected: PASS.
- [ ] **Step 6: Commit** `fix(server): retry persisting rotated Hardcover tokens once`

### Task 5: Drop sessions that the current key can't decrypt (A7)

**Files:**
- Modify: `apps/server/src/accountStore.ts:88-102` (`getSession`)
- Test: `apps/server/src/accountStore.test.ts`

**Interfaces:**
- Consumes: `open(sealed)` from `secretBox.ts`, which throws on a wrong key.
- Produces: `getSession` returns `null` (instead of throwing) for an undecryptable row, and deletes that row.

- [ ] **Step 1: Write the failing test** `it("getSession deletes and returns null for a row sealed with another key")`. Call `createSession("t", session)`, then `vi.stubEnv("HARDCOVER_TOKEN_KEY", Buffer.alloc(32, 9).toString("base64"))` and expect `getSession("t")` to be `null`. Re-stub the original key (`Buffer.alloc(32, 7)`) and expect `getSession("t")` still to be `null`, which proves the row was deleted.
- [ ] **Step 2: Run** `cd apps/server && npx vitest run src/accountStore.test.ts`. Expected: FAIL (it throws).
- [ ] **Step 3: Implement.** Wrap the two `open()` calls in `try`. In `catch`, call `deleteSession(sessionToken)`, log one line without any token, and return `null`.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit** `fix(server): treat undecryptable sessions as signed out`

### Task 6: Bind Hardcover sign-in to the browser that started it (A2)

The current flow is `POST /api/hardcover/connect` from `fetch`, followed by the browser landing on the callback. Nothing ties the callback to the browser that started it. The new flow makes connect a top-level `GET` navigation that sets a first-party, `SameSite=Lax`, HttpOnly cookie holding a random nonce. The callback must present the same nonce. Lax cookies are sent on the top-level redirect back from hardcover.app. iOS ASWebAuthenticationSession and Android Custom Tabs keep cookies for the session, so web and native share one path.

**Files:**
- Modify: `apps/server/src/accountStore.ts` (pending table and `savePending`/`takePending`)
- Modify: `apps/server/src/services/hardcoverAccount.ts` (`startConnect`, `completeConnect`)
- Modify: `apps/server/src/routes/hardcover.ts:66-84` (connect and callback routes)
- Modify: `apps/server/src/appAuth.ts:20-24` (`isPublicPath`)
- Modify: `apps/app/src/hardcoverConnect.ts:32-44`, `apps/app/src/api/client.ts:116-119` (delete `startHardcoverConnect`)
- Test: `apps/server/src/accountStore.test.ts`, `apps/server/src/services/hardcoverAccount.test.ts`, `apps/server/src/routes/hardcover.test.ts`, `apps/server/src/appAuth.test.ts`

**Interfaces:**
- Produces (accountStore): `savePending(state: string, v: { verifier: string; returnTo: string; bindingHash: string }): void` and `takePending(state: string): { verifier: string; returnTo: string; bindingHash: string } | null`. The table is `connect_pending (state TEXT PRIMARY KEY, verifier TEXT NOT NULL, return_to TEXT NOT NULL, binding_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`. `openAccountStore` also runs `DROP TABLE IF EXISTS oauth_pending` (rows only live 10 minutes).
- Produces (service): `startConnect(returnTo: string): { authorizeUrl: string; browserNonce: string }`, where the nonce is `randomToken()` and the stored hash is `sha256(nonce)`. Also `completeConnect(query, browserNonce: string | undefined): Promise<string>`, which throws `ExpiredCallbackError` when the nonce is missing or `sha256(nonce) !== bindingHash`. The pending row is consumed either way.
- Produces (route): `GET /api/hardcover/connect?returnTo=<url>` answers 400 when `returnTo` is missing or not allowed. Otherwise it sets `Set-Cookie: hc_connect=<nonce>; Path=/api/hardcover/; HttpOnly; SameSite=Lax; Max-Age=600`, plus `; Secure` when `HARDCOVER_REDIRECT_URI` starts with `https:`, and answers `302 Location: <authorizeUrl>`. `POST /api/hardcover/connect` is removed. The callback reads `hc_connect` from `req.headers.cookie` by hand, passes it to `completeConnect`, and always answers with `Set-Cookie: hc_connect=; Path=/api/hardcover/; Max-Age=0`.
- Produces (appAuth): `isPublicPath("/api/hardcover/connect")` is `true`, because a navigation can't send `X-App-Key`.
- Produces (app): `connectHardcover()` builds `${API_BASE_URL}/api/hardcover/connect?returnTo=${encodeURIComponent(returnUrl)}`. On web it calls `window.location.assign` with that URL; on native it calls `WebBrowser.openAuthSessionAsync(url, returnUrl)`. Everything after that is unchanged.

- [ ] **Step 1: Update the accountStore tests** to the new `savePending` and `takePending` shape (`bindingHash: "h"`), and add `it("drops the legacy oauth_pending table")`, which opens a file-less store twice without error.
- [ ] **Step 2: Write the failing service tests** in `hardcoverAccount.test.ts`. Change the `connect()` helper to pass `browserNonce` from `startConnect`. Then add:
  - `it("completeConnect rejects a callback without the starting browser's nonce")`: `startConnect(RETURN)` followed by `completeConnect({code,state,iss}, undefined)` rejects with `ExpiredCallbackError`, and `oauth.exchangeCode` is not called.
  - `it("completeConnect rejects another browser's nonce")`: passing `"other"` rejects the same way.
- [ ] **Step 3: Write the failing route tests** in `routes/hardcover.test.ts` (the service is mocked there).
  - `GET /api/hardcover/connect?returnTo=bookexplorer://x`, with `startConnect` mocked to `{ authorizeUrl: "https://hardcover.app/oauth2/authorize?s=1", browserNonce: "n1" }`, gives a 302 whose `location` is that URL. Its `set-cookie` contains `hc_connect=n1`, `HttpOnly` and `SameSite=Lax`.
  - `GET /api/hardcover/connect` with no `returnTo` gives 400.
  - `GET /api/hardcover/callback?code=c&state=s&iss=i` with header `cookie: "a=1; hc_connect=n1"` calls `completeConnect` with `(…, "n1")`, and the response `set-cookie` contains `Max-Age=0`.
  - `POST /api/hardcover/connect` gives 404.
- [ ] **Step 4: Add the appAuth assertion** `expect(isPublicPath("/api/hardcover/connect?returnTo=x")).toBe(true)`.
- [ ] **Step 5: Run** `cd apps/server && npx vitest run src/accountStore.test.ts src/services/hardcoverAccount.test.ts src/routes/hardcover.test.ts src/appAuth.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 6: Implement** the server side as given in the Interfaces block. Parse the cookie with `req.headers.cookie?.split(/;\s*/).find(c => c.startsWith("hc_connect="))?.slice("hc_connect=".length)`.
- [ ] **Step 7: Run the step 5 command again.** Expected: PASS.
- [ ] **Step 8: Implement the app side.** Delete `startHardcoverConnect` from `client.ts`, import `API_BASE_URL` in `hardcoverConnect.ts`, and build the URL as described. In `apps/app/src/hardcoverConnect.test.ts:10`, the `./api/client` mock must stop providing `startHardcoverConnect` and provide `API_BASE_URL: "https://api.test"` instead. Run `cd apps/app && npx tsc --noEmit && npx vitest run src/hardcoverConnect.test.ts`. Expected: no type errors, and the tests PASS.
- [ ] **Step 9: Manual check on web dev.** Connect, land on `/hardcover-connected`, and see "Connected as @…". Then copy a fresh callback URL into a private window. Expected: "This sign-in link has expired."
- [ ] **Step 10: Commit** `fix(hardcover): bind sign-in callback to the starting browser`

Known limit, accepted: when sign-in is disabled on the server, the browser now shows the raw 503 JSON instead of the app's "isn't available" text. Note this in the commit body.

### Task 7: Roll back a failed restore or migration (A1)

**Files:**
- Modify: `apps/app/src/storage/snapshot.ts:47-62` (`applySnapshot`, `migrateStorage`)
- Modify: `apps/app/src/backup.ts:74-77` (`importSnapshot`)
- Test: `apps/app/src/backup.test.ts`

**Interfaces:**
- Produces: `applySnapshot(snapshot: Snapshot, previous?: Snapshot): Promise<void>`. On any write failure with `previous` given, it re-applies `previous` and then rethrows the original error. If the rollback also fails, it still rethrows the original. Both callers pass the snapshot they read first.

- [ ] **Step 1: Write the failing tests** in `backup.test.ts`, using the existing `seed()`:
  - `it("replace import restores the old library when a write fails")`: `const before = await getSnapshot()`. Spy on `AsyncStorage.setItem` so the first call for key `"book-explorer:saved-lists"` rejects with `new Error("QuotaExceeded")`. Then `await expect(importSnapshot(emptyish, "replace")).rejects.toThrow("QuotaExceeded")`, where `emptyish` is `{ ...before, items: [], books: [], works: [], lists: [] }`. Finally expect `await getSnapshot()` to deep-equal `before`.
  - `it("rethrows the original error when the rollback write also fails")`: make every `setItem` reject, the first with `"first"` and later ones with `"second"`. Expect `importSnapshot(...)` to reject with `"first"`.
- [ ] **Step 2: Run** `cd apps/app && npx vitest run src/backup.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `applySnapshot(snapshot, previous?)` with `try { await Promise.all([...]) } catch (err) { if (previous) await Promise.all([...previous writes]).catch(() => {}); throw err; }`. In `importSnapshot`, read `before = await getSnapshot()` once and use it both for the merge input and as `previous`. In `migrateStorage`, pass the snapshot it read as `previous`.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit** `fix(app): roll back a failed restore`

### Task 8: Confirm before "Replace" (B1)

**Files:**
- Modify: `apps/app/src/components/BackupSection.tsx:61-74` (`applyBackup`)

**Interfaces:**
- Consumes: `confirmDestructive(title: string, message: string, action: string): Promise<boolean>` from `../confirm`.

- [ ] **Step 1: Implement.** As the first line inside `attempt(async () => …)` in `applyBackup`, before the `applying` lock, add: `if (mode === "replace" && !(await confirmDestructive("Replace your library?", "Everything saved here now, including notes and lists, is replaced by this backup. This can't be undone.", "Replace"))) return;`
- [ ] **Step 2: Typecheck** with `cd apps/app && npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 3: Manual check on web.** Pick a backup, press Replace, then Cancel. Expected: the library is unchanged and the Merge/Replace panel is still shown. Press Replace and confirm. Expected: "Your library was replaced with the backup."
- [ ] **Step 4: Commit** `fix(app): confirm before replacing the library from a backup`

### Task 9: Sync finishes failed removals instead of re-adding the books (B2)

A removal records the member's `hardcoverBookId` in the list's `removedMembers`. Sync deletes those books on Hardcover before reconciling, then forgets the ids. Forgetting them means a book the user later adds back on hardcover.app is not deleted again.

**Files:**
- Modify: `packages/shared/src/index.ts:398-401`. In the `removedMembers` item schema, add `hardcoverBookId: z.number().int().positive().optional()`.
- Modify: `apps/app/src/storage/savedLists.ts:32` (type) and `:62-65` (`updateList` copies the `hardcoverBookId` from the removed `prev` member when it has one). Also add `settleRemovals(listId: string): Promise<void>`.
- Modify: `apps/app/src/storage/mergeSnapshot.ts:43-45`. Keep a `hardcoverBookId` from either copy when rebuilding `removedMembers`.
- Modify: `apps/app/src/hardcoverLists.ts:82-103` (`syncWithHardcover`)
- Test: `apps/app/src/hardcoverLists.test.ts`, `apps/app/src/storage/mergeSnapshot.test.ts`

**Interfaces:**
- Produces: `SavedList.removedMembers?: { type; id; removedAt: number; hardcoverBookId?: number }[]`.
- Produces: `settleRemovals(listId)`, which strips `hardcoverBookId` from every `removedMembers` entry of that list. It is one queued write and does not bump `updatedAt`.

- [ ] **Step 1: Write the failing tests** in `hardcoverLists.test.ts`:
  - `it("sync removes on Hardcover a book whose removal failed, and doesn't re-add it")`. Create a list linked to 5 with book `X` (`hardcoverBookId: 9`). Call `removeFromList`. Make `fetchList` return `{ name, description: "", booksCount: 1, books: [{ hardcoverBookId: 9, isbn: "X", title: "T" }] }`. Run `syncWithHardcover(list)` and expect `remove` called with `(5, 9)`, list members without `X`, and `getSavedBook("X")` not live.
  - `it("sync forgets settled removals, so a book re-added on Hardcover stays")`. Following the test above, run a second sync whose remote again has book 9. Expect `remove` called once in total and `X` back on the list.
  - `it("sync keeps a book removed and then re-added locally")`. Remove `X`, then `addToList` `X` again (no `hardcoverBookId`). Run sync with a remote holding book 9 / `X`. Expect `remove` not called and `X` on the list.
- [ ] **Step 2: Write the failing merge test** in `mergeSnapshot.test.ts`: `it("keeps a removed member's hardcoverBookId through a merge")`.
- [ ] **Step 3: Run** `cd apps/app && npx vitest run src/hardcoverLists.test.ts src/storage/mergeSnapshot.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 4: Implement.** In `syncWithHardcover`, after `copyToHardcover` and before fetching, re-read `latest`. Build `pending` as the set of `hardcoverBookId`s from `latest.removedMembers` that no live member of `latest` holds, by id or by ISBN. Fetch the remote and run the partial-page check against the unfiltered remote. For each remote book whose id is in `pending`, call `removeHardcoverListBook(list.hardcoverListId, id)`. Reconcile against the remote with those filtered out. After `replaceMembers`, call `settleRemovals(list.id)`. A failing `removeHardcoverListBook` throws and leaves nothing settled.
- [ ] **Step 5: Run the step 3 command again, then** `cd apps/app && npx tsc --noEmit` (this exercises the `Same<>` schema check). Expected: PASS, and no type errors.
- [ ] **Step 6: Commit** `fix(app): sync completes failed Hardcover removals instead of re-adding them`

### Task 10: A local save failure during CSV import is an error, not a pause (B3)

**Files:**
- Modify: `apps/app/src/backup.ts:127-136` (`runCsvImport`)
- Test: `apps/app/src/backup.test.ts`

**Interfaces:**
- Consumes: `stopsPass(err): boolean` from `prefetchSaved.ts`. It stays unchanged.
- Produces: `runCsvImport` rejects when `saveBook` or `onSaved` throws. Lookup errors keep today's behaviour: pause on `stopsPass`, otherwise record in `failed`.

- [ ] **Step 1: Write the failing test** `it("rejects instead of pausing when saving a looked-up book fails")`. `fetchBook` resolves `apiBook("9780000000001","A")`. Spy on `AsyncStorage.setItem` so it rejects with `new Error("QuotaExceeded")`. Expect `runCsvImport([{ title: "A", isbn: "9780000000001" }], NEW_CSV_IMPORT, { onProgress, isStopped: () => false, gapMs: 0 })` to reject with `"QuotaExceeded"`.
- [ ] **Step 2: Run** `cd apps/app && npx vitest run src/backup.test.ts`. Expected: the new test FAILS (it resolves with `next: 0`).
- [ ] **Step 3: Implement.** Move `saveBook`, `onSaved` and `p.saved++` out of the `try`, so only `fetchBookWithAlternate` is guarded.
- [ ] **Step 4: Run again.** Expected: all PASS, including the existing 404 and 429 tests.
- [ ] **Step 5: Commit** `fix(app): surface save failures during CSV import`

### Task 11: Batch scan looks books up one at a time and labels failures honestly (B4)

**Files:**
- Modify: `apps/app/src/batchScan.ts` (add two exports)
- Modify: `apps/app/src/components/BatchScan.tsx:14-19`, `:57-63` and `:117-118`
- Test: `apps/app/src/batchScan.test.ts`

**Interfaces:**
- Produces: `createLookupQueue<T>(run: (isbn: string) => Promise<T>, opts?: { concurrency?: number; gapMs?: number }): (isbn: string) => Promise<T>`. Defaults are `concurrency: 1` and `gapMs: 700`: a pause after each lookup, so at most about 85 lookups a minute, under the server's 100 a minute. Calls run in enqueue order, and a rejection doesn't stop later calls.
- Produces: `lookupFailure(err: unknown): "missing" | "error"`, which gives `"missing"` only for an error whose `status === 404`.
- Row type: `lookup: "loading" | "ok" | "missing" | "error"`. The status text is `"Not found"` for `missing` and `"Couldn't look up"` for `error`. The Retry button shows for both.

- [ ] **Step 1: Write the failing tests** in `batchScan.test.ts`:
  - `it("createLookupQueue runs one at a time in order and survives a rejection")`. Use a `run` that records start/end and rejects for `"b"`, with `gapMs: 0`. Enqueue `"a"`, `"b"`, `"c"`. Expect the start order to be `a,b,c`, the in-flight count never above 1, `"b"` to reject, and `"c"` to resolve.
  - `it("lookupFailure tells not-found from everything else")`. `{ status: 404 }` gives `"missing"`; `{ status: 429 }`, `new TypeError("Network")` and `undefined` give `"error"`.
- [ ] **Step 2: Run** `cd apps/app && npx vitest run src/batchScan.test.ts`. Expected: FAIL (the exports are missing).
- [ ] **Step 3: Implement both exports in `batchScan.ts`.**
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Wire up `BatchScan.tsx`.** Create the queue once with `useRef(createLookupQueue(fetchBookWithAlternate))`. `resolve` uses it, and its error branch sets `lookup: lookupFailure(err)`. Update `rowStatus`, the Retry condition, and the `lookupFailed` check so they cover both `missing` and `error`. Run `cd apps/app && npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 6: Commit** `fix(app): pace batch-scan lookups and label failures honestly`

### Task 12: Import Hardcover lists whose name or description is too long (B5)

**Files:**
- Modify: `apps/app/src/hardcoverLists.ts:29` (`importList`)
- Test: `apps/app/src/hardcoverLists.test.ts`

**Interfaces:**
- Consumes: `createList` limits of `MAX_NAME = 100` and `MAX_DESCRIPTION = 1_000` (`savedLists.ts:9-10`).
- Produces: `importList` passes `name: remote.name.trim().slice(0, 100) || "Hardcover list"` and `description: remote.description.trim().slice(0, 1000)`.

- [ ] **Step 1: Write the failing tests:**
  - `it("importList shortens an over-long name and description")`: with a remote name of `"n".repeat(150)` and description `"d".repeat(1500)`, the created list has a name of length 100 and a description of length 1000.
  - `it("importList names a blank-named list")`: a remote name of `"   "` gives the name `"Hardcover list"`.
- [ ] **Step 2: Run** `cd apps/app && npx vitest run src/hardcoverLists.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** as given in the Interfaces block.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit** `fix(app): import Hardcover lists with long or blank names`

### Task 13: Say what the editions list and the CSV export actually do (B6, B7)

**Files:**
- Modify: `apps/server/src/sources/openLibrary.ts:146-147`. Add the one-line comment: `// shortcut: only Open Library's first 50 editions are listed, ranked and used as ISBN candidates; fetch further pages if popular works show odd editions.`
- Modify: `apps/app/src/csv.ts:43`. Change the comment to: `// Goodreads export column names, so the file imports into Goodreads and StoryGraph. Importing it back here restores books by ISBN only; the JSON backup is the full restore.`
- Modify: `apps/app/src/components/BackupSection.tsx:116`. In the help text, after "Subjects and genres are only kept in the JSON backup.", add: " Importing a CSV here adds books by ISBN only, without lists or notes."

- [ ] **Step 1: Make the three edits.**
- [ ] **Step 2: Run the full gate** from the repo root: `npm run typecheck && npm test`. Expected: everything passes.
- [ ] **Step 3: Commit** `docs: note the 50-edition cap and what a CSV import restores`
