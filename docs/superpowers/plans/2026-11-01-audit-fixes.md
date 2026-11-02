# Repo Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 15 findings of the 2026-11-01 repo audit (three data/availability bugs, seven should-fix items, five cleanups), and make the detail pages' "View as graph" / "Find connection" buttons one consistent size at every screen width (Task 13, user request).

**Architecture:** Each task fixes one finding (Task 10 bundles four one-liners) at its root, in the file that owns the rule, reusing existing helpers (`seedSavedWorkFromApi` pattern, `updateList`, `UpstreamUnavailableError`, the path route's per-route rate limit). No new dependencies, no new layers.

**Tech Stack:** TypeScript, Expo 57 / React Native (apps/app), Fastify 5 + node:sqlite (apps/server), zod schemas (packages/shared), vitest.

**Spec:** The audit report given in the session on 2026-11-01 (findings 1–15). Each task below restates its finding in one line.

## Global Constraints

- Work on a branch, not `main` (e.g. `fix/audit-2026-11-01`).
- `npm run typecheck` and `npm test` from the repo root must pass after every task.
- App code: read the Expo v57 docs (https://docs.expo.dev/versions/v57.0.0/) before touching Expo APIs (apps/app/AGENTS.md).
- No new dependencies. No `SCHEMA_VERSION` bump: the only stored-shape change (Task 2) is an optional field.
- Comments: one line of why, matching the surrounding code; no history narration.
- Test commands: app `npm test --workspace=apps/app -- <file-filter>`, server `npm test --workspace=apps/server -- <file-filter>`.

## Review Focus

1. A Hardcover import of a book the user removed earlier (tombstoned record) should bring it back as a saved book. Test in Task 1.
2. A Hardcover import or sync of a book that is already saved with notes must keep those notes. Test in Task 1.
3. Merging an old backup that has no `removedMembers` key with a newer local list must still apply the local removal, without a schema error. Test in Task 2.
4. A user whose 90-day session has lapsed should get `null` from `userAuthorization` (so the routes answer 401 and the app shows "Connect again"), not a 500. Test in Task 5.
5. Wheel or pinch zoom at extreme input (scale ×10, ×0.01) must stay within `MIN_SCALE`..`MAX_SCALE`. Test in Task 9.

---

### Task 1: Books imported from Hardcover get saved (finding 1)

Today `importList` and `syncWithHardcover` write list members only, so these books have no saved item or record: they show "not saved", are missing from CSV export and aren't prefetched. Books that sync drops are left saved on no list.

**Files:**
- Create: `apps/app/src/storage/unlisted.ts` (move `unsaveIfUnlisted` here from `listMembership.ts` so `hardcoverLists.ts` can use it without an import cycle; `listMembership.ts` re-exports it)
- Modify: `apps/app/src/storage/savedBooks.ts` (add two functions)
- Modify: `apps/app/src/hardcoverLists.ts:24-29` (`importList`), `:77-90` (`syncWithHardcover`)
- Modify: `apps/app/src/useSavedPrefetch.ts:28-29` (seed book stubs after fetch)
- Modify: `apps/app/app/book/[isbn].tsx` (seed effect, mirroring `app/work/[id].tsx:88`)
- Modify: `apps/app/app/hardcover.tsx` (`doImport`), `apps/app/src/components/AddToListButton.tsx` (after `importChosenLists`), `apps/app/app/lists/[id].tsx` (after sync): call `void prefetchMissingSaved(queryClient)`
- Test: `apps/app/src/hardcoverLists.test.ts`, `apps/app/src/storage/savedBooks.test.ts`

**Interfaces:**
- Produces, in `savedBooks.ts`:
  - `saveListedBook(isbn: string, title: string): Promise<void>`. If there's no live record, it writes a stub record (`wikidataId/openLibraryEditionId/openLibraryWorkId/format: null`, `authorNames/subjects/genres: []`, `notes: ""`, `savedAt: now`, stamped). A live record is left untouched. Then it calls `ensureSaved({ type: "book", id: isbn, title })`. It does **not** call `ensureOnAList`, because the caller has already listed the book.
  - `seedSavedBookFromApi(isbn: string, book: Book): Promise<SavedBookRecord | null>`. This mirrors `seedSavedWorkFromApi` (`savedWorks.ts:87`). It acts only on a live record with `authorNames`, `subjects` and `genres` all empty. It fills `authorNames`, `subjects`, `genres`, `format`, `wikidataId`, `openLibraryEditionId` and `openLibraryWorkId` from `book`. It returns null when nothing is written.
- Produces, in `storage/unlisted.ts`: `unsaveIfUnlisted(member: Pick<ListMember, "type" | "id">): Promise<boolean>` (body moved unchanged).

- [ ] **Step 1: Write the failing tests**

In `hardcoverLists.test.ts`, use `remoteList = { name: "HC", description: "", booksCount: 1, books: [{ hardcoverBookId: 1, title: "Dune", isbn: "9780441013593" }] }`:
- `it("importList saves each imported book")`: after `importList(9)`, `getSavedBook("9780441013593")` matches `{ title: "Dune", notes: "" }`, and `getSavedItems()` contains `{ type: "book", id: "9780441013593" }`.
- `it("importList brings back a book the user had removed")`: first `saveListedBook` then `unsaveBook` the ISBN; after `importList(9)`, `getSavedBook` is not null.
- `it("importList keeps an already-saved book's notes")`: `saveListedBook` + `updateSavedBook(isbn, { notes: "mine" })`; after import, notes are still `"mine"`.
- `it("syncWithHardcover saves books it pulls in and unsaves ones Hardcover dropped")`: start with a linked list holding member A (`hardcoverBookId: 2`, saved). Remote has only Dune. Afterwards Dune is saved, and A's `getSavedBook` is null.

In `savedBooks.test.ts`:
- `it("seedSavedBookFromApi fills a stub once")`: subjects come from the `Book`, and a second call returns null.
- `it("seedSavedBookFromApi leaves a record with authors alone")`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npm test --workspace=apps/app -- hardcoverLists savedBooks`
Expected: FAIL (`saveListedBook` / `seedSavedBookFromApi` not exported; import leaves `getSavedBook` null).

- [ ] **Step 3: Implement**

- Move `unsaveIfUnlisted` to `storage/unlisted.ts`, and add `export { unsaveIfUnlisted } from "./unlisted";` in `listMembership.ts`.
- Add the two functions to `savedBooks.ts`.
- `importList`: after `replaceMembers`, call `saveListedBook(m.id, m.title)` for each `book` member (in sequence).
- `syncWithHardcover`: compute `next = reconcile(latest.members, …)` and `replaceMembers(list.id, next)`. Then call `saveListedBook` for each book in `next` that wasn't in `latest.members`, and `unsaveIfUnlisted` for each member of `latest.members` (key `type:id`) that isn't in `next`.
- `useSavedPrefetch` book branch: `.then((book) => seedSavedBookFromApi(t.id, book).catch(() => undefined))` (by `t.id`, the record key, which may differ from `book.isbn`).
- Book page: `if (data && savedRecord) seedSavedBookFromApi(savedRecord.isbn, data).then((r) => r && setSavedRecord(r))`, as the work page does.
- Add the three `prefetchMissingSaved` calls.

- [ ] **Step 4: Run tests**

Run: `npm test --workspace=apps/app` and `npm run typecheck --workspace=apps/app`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app
git commit -m "fix(app): save books imported or synced from Hardcover lists"
```

---

### Task 2: List removals survive a backup merge (finding 2)

`mergeList` unions members, so a member removed locally comes back from an older backup. The fix records removals per list and drops any member whose last add came before its removal.

**Files:**
- Modify: `apps/app/src/storage/savedLists.ts` (`SavedList` type, `updateList`, `deleteList`)
- Modify: `apps/app/src/storage/mergeSnapshot.ts:37-46` (`mergeList`)
- Modify: `packages/shared/src/index.ts:379-400` (`SavedListExportSchema`)
- Test: `apps/app/src/storage/mergeSnapshot.test.ts`, `apps/app/src/storage/savedLists.test.ts`, `apps/app/src/backup.test.ts`

**Interfaces:**
- Produces: `SavedList.removedMembers?: { type: ListMember["type"]; id: string; removedAt: number }[]`. The key is omitted when empty, so untouched lists export exactly as before.
- Schema: `removedMembers: z.array(z.object({ type: z.enum(["book","work","author"]), id: z.string().min(1).max(200), removedAt: z.number().int().nonnegative() })).max(MAX_IMPORT_RECORDS).optional()`. The `Same<SnapshotExport, Snapshot>` check in `backup.ts` must still compile.

- [ ] **Step 1: Write the failing tests**

In `mergeSnapshot.test.ts` (use `one = { type: "book", id: "1", title: "One", addedAt: 5 }`):
- `it("a member removed on the newer copy doesn't come back from the older one")`: `a = list("x", 10, { members: [one] })` (no `removedMembers` key: Review Focus 3), `b = list("x", 30, { removedMembers: [{ type: "book", id: "1", removedAt: 25 }] })`. In both merge orders, `members` is `[]` and `removedMembers` holds the entry.
- `it("a member re-added after another copy's removal stays")`: one side has the removal at 25; the other has `one` with `addedAt: 28` and `updatedAt: 28`. The member is kept in both orders.
- The existing test "unions a live list's members added on each side…" must still pass unchanged.

In `savedLists.test.ts`:
- `it("removeFromList records the removal and addToList clears it")`.
- `it("replaceMembers records members it drops")`.
- `it("deleteList clears removedMembers")`.

In `backup.test.ts`:
- `it("exports and re-imports a list's removedMembers")`: `parseSnapshotJson(await exportJson())` keeps the field.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npm test --workspace=apps/app -- mergeSnapshot savedLists backup`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `updateList`: after `change`, set `removedMembers` to the previous entries plus `{type, id, removedAt: now}` for each member that was in `prev.members` but isn't in `next.members`, minus entries whose key is in `next.members`. Delete the key when empty. Every member edit (`removeFromList`, `replaceMembers`, `addToList`) goes through `updateList`.
- `deleteList`: drop the key.
- `mergeList`, when both copies are live: take the removals union, keeping the max `removedAt` per `type:id`. Filter the combined member list (winner's + other-only) to drop any member that has a removal with `removedAt >= m.addedAt`. Return the union as `removedMembers` (omit when empty). The tombstone branch is unchanged.
- Add the field to `SavedListExportSchema`.

- [ ] **Step 4: Run tests**

Run: `npm run typecheck && npm test` (repo root)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app packages/shared
git commit -m "fix(app): list removals are no longer undone by merging a backup"
```

---

### Task 3: Cap the per-host request queue (finding 3)

The queue of calls waiting on an upstream host has no limit, so one client's path searches can starve every user of Open Library.

**Files:**
- Modify: `apps/server/src/httpClient.ts:121-130` (`acquire`)
- Test: `apps/server/src/httpClient.test.ts`

**Interfaces:**
- Produces: `const MAX_QUEUED_PER_HOST = 50`. When `st.waiters.length >= MAX_QUEUED_PER_HOST`, `acquire` throws `new UpstreamUnavailableError(host, Math.ceil(st.waiters.length / limit.perSecond) * 1000)` before queuing. It opens no cooldown. Existing handling covers the rest: the routes turn this error into a 503 with `Retry-After` (`upstreamErrorHandler`), and path search stops on it (`graphQuery.ts` `upstreamDown`).

- [ ] **Step 1: Write the failing test**

`it("rejects a call once 50 are queued for a host, without calling fetch")`:
- Stub `fetch` to return a held promise (push each resolver to `held[]`).
- Start 56 calls to `https://example.com` (the default limit is 6 at a time, then 50 queued), each with `.catch(() => {})`, then `await Promise.resolve()`.
- `await expect(fetchWithTimeout("https://example.com")).rejects.toBeInstanceOf(UpstreamUnavailableError)`.
- `expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(6)`.
- In `finally`, resolve `held` with `mockResponse(200)`. `resetUpstreamState()` in `beforeEach` already isolates tests.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test --workspace=apps/server -- httpClient`
Expected: FAIL (the 57th call queues instead of rejecting).

- [ ] **Step 3: Implement the cap in `acquire`**

- [ ] **Step 4: Run tests**

Run: `npm test --workspace=apps/server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/httpClient.ts apps/server/src/httpClient.test.ts
git commit -m "fix(server): reject instead of queueing without limit when an upstream host is backed up"
```

---

### Task 4: A user's Hardcover 429 doesn't pause Hardcover for everyone (finding 4)

**Files:**
- Modify: `apps/server/src/sources/hardcover.ts:33-46` (`hardcoverGraphql`)
- Test: `apps/server/src/sources/hardcover.test.ts`

**Interfaces:**
- Behavior: when `authorization !== authHeader()` (it's a user's token), use the existing plain-`fetch` branch (`AbortSignal.timeout(10_000)`), the same one `retry: false` uses. Comment: `// A user's token has its own Hardcover limit; its 429 must not pause the host for everyone.` The server key keeps using `fetchWithTimeout`. The return type and errors are unchanged.

- [ ] **Step 1: Write the failing test and update the old one**

- `it("a signed-in user's 429 throws HardcoverRateLimitError and never touches the shared host limiter")`:
  - `vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, headers: new Headers({ "Retry-After": "30" }) }))`.
  - `await expect(hardcoverGraphql("q", {}, "Bearer user")).rejects.toMatchObject({ retryAfterSeconds: 30 })`.
  - `expect(fetchWithTimeout).not.toHaveBeenCalled()`.
  - `vi.unstubAllGlobals()` in `afterEach`.
- `it("the server key still goes through the shared limiter")`: `lookupByIsbn("1")` calls `fetchWithTimeout`.
- Update `it("uses the caller's token over the server key")` to read `Authorization` from the stubbed global `fetch` call instead of `fetchWithTimeout`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npm test --workspace=apps/server -- sources/hardcover`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run tests**

Run: `npm test --workspace=apps/server`
Expected: PASS (`hardcoverUser.test.ts` and `routes/hardcover.test.ts` included).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sources
git commit -m "fix(server): a user's Hardcover rate limit no longer pauses Hardcover for every user"
```

---

### Task 5: Hardcover sessions expire after 90 days (finding 5)

**Files:**
- Modify: `apps/server/src/accountStore.ts` (`createSession`, `getSession`)
- Test: `apps/server/src/accountStore.test.ts`, `apps/server/src/services/hardcoverAccount.test.ts`

**Interfaces:**
- Produces: `const SESSION_TTL_MS = 90 * 24 * 60 * 60_000`. This is an absolute lifetime from `created_at`; a token refresh doesn't extend it.
  - `getSession` adds `AND created_at > ?` (now − TTL).
  - `createSession` first runs `DELETE FROM sessions WHERE created_at <= ?`.

- [ ] **Step 1: Write the failing tests**

- `accountStore.test.ts`: `it("getSession forgets a session 90 days after it was created")`. With fake timers: `createSession("t", session)`, advance `90 * 864e5 + 1`, expect `getSession("t")` to be null.
- `accountStore.test.ts`: `it("refreshing tokens doesn't extend a session")`. Call `updateTokens` at day 89; at day 90 + 1 ms `getSession` is null.
- `hardcoverAccount.test.ts`: `it("userAuthorization returns null for a lapsed session")` (Review Focus 4). Use `connect()` + `redeemHandoff`, advance 90 days + 1 ms, expect `userAuthorization(token)` to be null.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npm test --workspace=apps/server -- accountStore hardcoverAccount`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run tests**

Run: `npm test --workspace=apps/server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src
git commit -m "fix(server): Hardcover sessions expire 90 days after sign-in"
```

---

### Task 6: Adding a work to a Hardcover list looks up only its editions (finding 6)

**Files:**
- Modify: `apps/server/src/routes/hardcover.ts:37-44` (`memberIsbns`) and its imports
- Test: `apps/server/src/routes/hardcover.test.ts`

**Interfaces:**
- `memberIsbns(type: string, id: string): Promise<string[] | null>`. The `auth` parameter is dropped. For a work it uses `getWork(id)` from `../sources/openLibrary.js` and returns `work?.isbnCandidates ?? []`. The import of `getWorkDetail` is removed.

- [ ] **Step 1: Update the tests to the new contract**

- Replace `vi.mock("../services/workService.js", …)` with `vi.mock("../sources/openLibrary.js", () => ({ getWork: vi.fn() }))`.
- Change the cases around lines 195 and 205 to `vi.mocked(getWork).mockResolvedValue({ isbnCandidates: ["9780306406157"] } as never)` and `mockResolvedValue(null)`. Assert `findBookId` is called with `(["9780306406157"], <auth>)`, and `getWork` with the work id.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npm test --workspace=apps/server -- routes/hardcover`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run tests**

Run: `npm test --workspace=apps/server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes
git commit -m "perf(server): adding a work to a Hardcover list fetches only its editions"
```

---

### Task 7: Enforce the shape of sign-in return-URL prefixes (finding 7)

**Files:**
- Modify: `apps/server/src/services/hardcoverAccount.ts:19-24` (`allowedPrefixes`)
- Modify: `apps/server/.env.example` (the `HARDCOVER_RETURN_URLS` comment)
- Test: `apps/server/src/services/hardcoverAccount.test.ts`

**Interfaces:**
- Custom entries are kept only if `(p.endsWith("/") || p.endsWith("://")) && p !== "exp://"`. The defaults are unchanged.
- Doc line: replace "Add exp:// for Expo Go" with "Add exp://<your-lan-ip>:8081/ for Expo Go (never bare exp://, which matches anyone's project)".

- [ ] **Step 1: Write the failing test**

`it("ignores return prefixes that could match someone else's address")`: stub `HARDCOVER_RETURN_URLS = "exp://,https://app.test,https://ok.test/,myapp://"`. Then:
- `startConnect("exp://evil.test/--/x")` throws `InvalidReturnUrlError`.
- `startConnect("https://app.test.evil.com/")` throws `InvalidReturnUrlError`.
- `startConnect("https://ok.test/hc")` and `startConnect("myapp://cb")` return a URL.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test --workspace=apps/server -- hardcoverAccount`
Expected: FAIL.

- [ ] **Step 3: Implement the filter and the doc change**

- [ ] **Step 4: Run tests**

Run: `npm test --workspace=apps/server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "fix(server): only accept sign-in return prefixes that end in / or ://"
```

---

### Task 8: Tighter rate limit on /og/* (finding 8)

**Files:**
- Modify: `apps/server/src/routes/og.ts:14`
- Test: `apps/server/src/routes/og.test.ts`

**Interfaces:**
- `const OG_RATE_LIMIT = { max: 20, timeWindow: "1 minute" }`, passed as `{ config: { rateLimit: OG_RATE_LIMIT } }` on `app.get("/og/*", …)`, as in `routes/path.ts`.

- [ ] **Step 1: Write the failing test**

`it("is limited more tightly than the global 100 a minute")`: register `rateLimit` (`max: 100`) and then `ogRoutes`, as `path.test.ts:10-15` does. Make 21 `GET /og/book/9780141439518` requests: the first 20 aren't 429, and the 21st is 429.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test --workspace=apps/server -- routes/og`
Expected: FAIL (the 21st is 200).

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run tests**

Run: `npm test --workspace=apps/server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/og.ts apps/server/src/routes/og.test.ts
git commit -m "fix(server): rate-limit the keyless /og/ pages more tightly"
```

---

### Task 9: Move the graph's zoom math out of the screen (finding 9)

**Files:**
- Modify: `apps/app/src/graphLayout.ts` (next to `fitScale` and `MIN_SCALE`)
- Modify: `apps/app/app/graph/[type]/[id].tsx:48-59` (constants), `:217-238` (`clampTranslation`, `zoomAbout`), `:290-307` (the two opacity props)
- Test: `apps/app/src/graphLayout.test.ts`

**Interfaces (each function body starts with `"worklet";`, as the code it replaces does):**
- Move `MAX_SCALE = 3`, `LABEL_FADE_OUT_SCALE = 1.0` and `LABEL_FADE_IN_SCALE = 1.3` from the screen into `graphLayout.ts`, exported.
- `clampOffset(offset: number, viewport: number, content: number, scale: number): number`: the existing per-axis formula from `clampTranslation`.
- `zoomAt(view: { scale: number; x: number; y: number }, nextScale: number, focalX: number, focalY: number): { scale: number; x: number; y: number }`: clamps to `[MIN_SCALE, MAX_SCALE]` and keeps the focal point fixed. It does no translation clamping.
- `labelOpacity(scale: number): number`: the fade ramp now duplicated in `pillAnimatedProps` and `labelAnimatedProps`.
- In the screen, `clampTranslation` calls `clampOffset` per axis, `zoomAbout` calls `zoomAt` then `clampTranslation`, and both animated props call `labelOpacity(scale.value)`.

- [ ] **Step 1: Write the failing tests**

- `clampOffset`: content smaller than viewport (`viewport 400, content 300, scale 1`) gives `-50 → 0`, `150 → 100`, `40 → 40`. Content larger (`viewport 300, content 400`) gives `20 → 0`, `-150 → -100`.
- `zoomAt({ scale: 1, x: 0, y: 0 }, 2, 100, 50)` equals `{ scale: 2, x: -100, y: -50 }`.
- `zoomAt(…, 10, …).scale === MAX_SCALE` and `zoomAt(…, 0.01, …).scale === MIN_SCALE` (Review Focus 5).
- `labelOpacity(1) === 0`, `labelOpacity(1.3) === 1`, and `labelOpacity(1.15)` is close to `0.5`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npm test --workspace=apps/app -- graphLayout`
Expected: FAIL (not exported).

- [ ] **Step 3: Implement the functions and rewire the screen**

- [ ] **Step 4: Verify**

Run: `npm run typecheck --workspace=apps/app && npm test --workspace=apps/app`, then `cd apps/app && npx expo export --platform web` (the CI step).
Expected: PASS and a successful export. Then, by hand in the web app (`npm run dev:app`, then `w`): wheel zoom, double-click zoom, drag and the reset button behave as before, and labels fade in between 1.0× and 1.3×.

- [ ] **Step 5: Commit**

```bash
git add apps/app
git commit -m "refactor(app): graph zoom math lives in graphLayout with tests"
```

---

### Task 10: Small cleanups (findings 11–14)

**Files:**
- Modify: `apps/server/src/index.ts:47` (a bad app key answers 403 instead of 401, so the app's 401 handler at `apps/app/src/api/client.ts:83` no longer drops a valid Hardcover session)
- Modify: `README.md:64` ("Wikidata 5/s" becomes "Wikidata 2/s, one at a time", to match `httpClient.ts:20`)
- Modify: `apps/server/src/validation.ts:15` (`isOpenLibraryWorkId` returns `OPEN_LIBRARY_WORK_ID.test(id)`, imported from `@book-explorer/shared`)
- Modify: `apps/app/src/api/client.ts:72-78` (delete the misplaced first copy of the "Parses every response…" comment; keep the one above `getJson`)

- [ ] **Step 1: Make the four edits**

Also run `grep -rn "401" README.md docs/CODEBASE.md apps/server/.env.example` and update any line that describes the app-key rejection.

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm test` (`validation.test.ts` covers the id rule).
Then by hand: start the server with `APP_SHARED_SECRET=x npm run dev:server`; `curl -s -o /dev/null -w "%{http_code}" localhost:3001/api/books/isbn/9780141439518` prints `403`, and `curl localhost:3001/health` prints `{"status":"ok"}`.

- [ ] **Step 3: Commit**

```bash
git add README.md apps/server/src/index.ts apps/server/src/validation.ts apps/app/src/api/client.ts
git commit -m "chore: 403 for a bad app key, one work-id rule, doc and comment fixes"
```

---

### Task 11: Trim history-narrating comments (finding 15)

**Files:**
- Modify: `apps/server/src/sources/openLibrary.ts`, `apps/server/src/services/graphService.ts`

Rule: cut each comment block to the one-line why the code can't show. Drop "confirmed live…", "used to…" and "this was reproduced…" history, which git already has. Keep any line that names a non-obvious upstream quirk the code relies on, shortened (for example "Open Library's text uses \r\n").

- [ ] **Step 1: Edit the comments only**

- [ ] **Step 2: Verify no code changed**

Run: `git diff -U0 apps/server/src | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | grep -vE '^[+-]\s*(//|\*|/\*\*|\*/)|^[+-]\s*$'`
Expected: no output. Then `npm test --workspace=apps/server` passes.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src
git commit -m "chore(server): trim comments to the why"
```

---

### Task 12: Remove finished review and planning documents (finding 10)

**Needs the user's sign-off on the list before running.** Git history keeps everything.

**Delete (proposed):**
- `docs/personaReviews/`
- `docs/CompiledUserReview.md`, `docs/Luna6UserReport.md`, `docs/Luna6UserReviewLight.md`
- `docs/OpusUserReview.md`, `docs/OpusUserReviewLight.md`
- `docs/copilotReview.md`, `docs/copilotReviewLight.md`
- `docs/UX_REVIEW_2026-11-01.md`, `docs/AUDIT_2026-10-26.md`, `docs/CODE_REVIEW.md`
- `docs/userReviewPlan.md`, `docs/userQuestions.txt`, `docs/personas.txt`
- the root `accessibilityFixPlan.txt`

**Keep:** `README.md`, `docs/CODEBASE.md`, `docs/deploy-social-cards.md`, `docs/superpowers/` (the plans workflow, including this file).

**Ask the user:** `docs/10_26_to-dos.txt`, `docs/10_27_to-dos.txt`, `docs/11_01_to-dos.txt`, `docs/DESIGN_PLAN.md`.

- [ ] **Step 1: `git rm -r` the confirmed list**

- [ ] **Step 2: Fix links**

Remove the `docs/CODE_REVIEW.md` sentence from `README.md:8-10`. Then `grep -rn "personaReviews\|CODE_REVIEW\|UserReview\|copilotReview\|AUDIT_2026\|accessibilityFixPlan" README.md docs apps` prints nothing.

- [ ] **Step 3: Commit**

```bash
git commit -m "docs: remove finished reviews and plans (kept in git history)"
```

---

### Task 13: "View as graph" and "Find connection" are the same size at every width (user request)

Today the book, work and author pages each pass `style={{ flex: 1 }}` to both buttons, inside `DetailTop`'s `actions` row. That row shrinks to fit its contents and wraps (`DetailTop.tsx` `actions` style). So the button widths follow label length, and at narrow widths "Find connection" wraps to two lines while "View as graph" stays on one. The subject page has only "View as graph", which takes yet another width. The font is already the same everywhere (`variant="primary"`).

**Files:**
- Modify: `apps/app/src/components/DetailTop.tsx` (the primary-actions row style, plus an exported button style)
- Modify: `apps/app/src/components/Button.tsx` (`primaryText` gets `textAlign: "center"`, so a two-line label stays centred)
- Modify: `apps/app/app/book/[isbn].tsx:127-145`, `apps/app/app/work/[id].tsx:111-125`, `apps/app/app/author/[id].tsx:79-93`, `apps/app/app/subject/[slug].tsx:73-79` (replace `style={{ flex: 1 }}` with the shared style; the subject button gets it too)

**Interfaces:**
- Produces, in `DetailTop.tsx`: `export const PRIMARY_ACTION_STYLE: ViewStyle = { flexGrow: 1, flexBasis: 0, maxWidth: 240, paddingHorizontal: 12, justifyContent: "center" }`. Every equal width comes from `flexBasis: 0` and `flexGrow: 1`; `maxWidth: 240` stops them stretching on wide screens and gives the subject page's single button the same width cap.
- The `primaryActions` row gets its own style instead of the shared `actions` style: `{ flexDirection: "row", flexWrap: "nowrap", alignItems: "stretch", alignSelf: "stretch", gap: spacing.sm, marginTop: spacing.md }`. `alignItems: "stretch"` makes both buttons as tall as the taller one, so a label that wraps changes both buttons together.
- The `actions` row (Save, Share, …) is unchanged.

There's no component-render test setup in this repo (vitest runs logic only), so this task is checked by eye.

- [ ] **Step 1: Implement the style, the row and the four page changes**

- [ ] **Step 2: Verify**

Run: `npm run typecheck --workspace=apps/app && npm test --workspace=apps/app`. Expected: PASS.

Then by hand in the web app (`npm run dev:app`, press `w`). In DevTools' device toolbar, set widths of 320, 390, 560 (where `DetailTop` switches to side-by-side), 768 and 1280. On a book page, a work page and an author page:
- the two buttons are always side by side, each the same width and height;
- the labels use the same font and size;
- neither button is wider than 240px.

On a subject page, "View as graph" is no wider than 240px. At 320px both labels may wrap, but they wrap together and stay centred.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/components/DetailTop.tsx apps/app/src/components/Button.tsx "apps/app/app/book/[isbn].tsx" "apps/app/app/work/[id].tsx" "apps/app/app/author/[id].tsx" "apps/app/app/subject/[slug].tsx"
git commit -m "fix(app): graph and connection buttons share one size at every width"
```
