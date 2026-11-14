# Audit Fixes: Sync Race, Shared Sync, One-Read Storage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three findings from the 2026-11-13 repo audit (a removal undone by a running sync, near-copy sync code for the two list services, one storage read per saved record), correct UMD's Primo view id, and stop an unreachable Library of Congress from holding book and work pages for 30+ seconds.

**Architecture:** All changes are in `apps/app`. Task 1 is a guard on the list screen. Task 2 moves the pull half of `syncWithHardcover` / `syncWithOpenLibrary` into one `syncLinkedList` in `listSync.ts`, driven by a small per-service object; the push halves (`copyTo*`) stay separate because they genuinely differ (one member at a time vs. batches of 50). Task 3 swaps per-key `getItem` for one `AsyncStorage.multiGet` in the two "read every record" functions.

**Tech Stack:** Expo / React Native app, TypeScript, Vitest, `@react-native-async-storage/async-storage` 2.2.0 (has `multiGet(keys) → [key, value | null][]`).

**Spec:** the audit report from the 2026-11-13 session. The three findings, verbatim in substance:
1. *Removing a book during a sync gets undone* (`app/lists/[id].tsx:271`, `src/hardcoverLists.ts:72-84`): sync reads the list once, then writes its merged result after several network calls; the remove button stays live meanwhile, so a removal made during sync is overwritten and its pending remote delete is settled away. Fix: disable remove while busy.
2. *Hardcover and Open Library sync are near-copies* (`src/hardcoverLists.ts`, `src/openLibraryLists.ts`): the stale-id, partial-page and pending-removal rules exist twice and must change together. Fix: one shared sync in `listSync.ts`.
3. *Reading every saved book is one storage read per book* (`src/storage/savedBooks.ts` `getAllSavedBooks`, used on every work-page focus): fix with one `multiGet`.

## Global Constraints

- Tasks 1–3, 5 and 6: branch from `main` as `fix/audit-sync-and-storage` (independent of the unpushed `fix/remove-mbln`).
- Task 4 only: commit on `fix/remove-mbln`, where the UMD code lives (`apps/server/src/sources/almaSru.ts` is not on `main` yet).
- No new dependencies. No user-visible copy changes: error strings stay byte-identical, e.g. `"Hardcover sent only part of this list, so nothing was removed. Try again later."`, `"This list isn't linked to Open Library."`.
- Every existing test in `src/hardcoverLists.test.ts`, `src/openLibraryLists.test.ts`, `src/storage/*.test.ts` must pass **unchanged** — they are the refactor's safety net.
- Run app tests with `npm test --workspace=apps/app`; typecheck with `npm run typecheck` from the repo root.

## Review Focus

1. A second tap on "remove" in the instant between tapping Sync and the re-render that disables the button: the removal must not run (React state lags a render; the screen already uses `busyRef` for this). Pinned in Task 1, Step 2.
2. One saved-book key holding damaged JSON: `getAllSavedBooks` still returns every other record. Test in Task 3.
3. A write to a saved book still queued when `getAllSavedBooks` runs: the result shows that write, as today. Test in Task 3.
4. A key deleted between `getAllKeys` and `multiGet` (value `null`): skipped, not a crash. Covered by Task 3's damaged-record handling (`null` and bad JSON both drop out).
5. A remote list that names the same Hardcover book twice while it's a pending local delete: the remote delete is sent once, as Open Library's path already does. Test in Task 2.

---

### Task 1: Block list-member removal while a sync, copy or unlink runs

**Files:**
- Modify: `apps/app/app/lists/[id].tsx:69-71` (`handleRemove`) and `:268-272` (remove `Pressable`)

**Interfaces:**
- Consumes: the screen's existing `busy` state and `busyRef` ref (lines 44-47), set by `runSync`, `copy` and `unlink`.
- Produces: nothing new.

There is no component-test setup in this app (no test renders a screen), so this task is verified by typecheck and by hand.

- [ ] **Step 1: Add `disabled={busy}` to the remove `Pressable`** (the one with `titleRef("Remove from this list")`). Pressable folds `disabled` into `accessibilityState`, so screen readers announce it; no extra prop.
- [ ] **Step 2: Guard `handleRemove`'s first line with `if (busyRef.current) return;`** — covers Review Focus 1, matching how `copy` and `unlink` guard.
- [ ] **Step 3: Typecheck.** Run: `npm run typecheck` → no errors.
- [ ] **Step 4: Check by hand on web.** `npm run dev:server` and `npm run dev:app`, press `w`. Open a list linked to Hardcover or Open Library, tap Sync, and tap a member's remove (×) while "Syncing…" shows: nothing happens. After sync finishes, remove works.
- [ ] **Step 5: Commit**

```bash
git add "apps/app/app/lists/[id].tsx"
git commit -m "fix(app): no list removals while a sync runs, so sync can't undo them"
```

---

### Task 2: One shared pull-and-reconcile for both list services

**Files:**
- Modify: `apps/app/src/listSync.ts` (add `syncLinkedList`, `LinkedListService`)
- Modify: `apps/app/src/hardcoverLists.ts:72-85` (`syncWithHardcover` becomes a call)
- Modify: `apps/app/src/openLibraryLists.ts:73-90` (`syncWithOpenLibrary` becomes a call)
- Test: `apps/app/src/hardcoverLists.test.ts` (one new test)

**Interfaces:**
- Produces, in `listSync.ts`:

```ts
export interface LinkedListService<Item, Id extends string | number> {
  name: "Hardcover" | "Open Library";           // used in both error strings
  settle: "hardcover" | "openLibrary";          // settleRemovals' service argument
  remoteListId: (list: SavedList) => string | number | undefined; // list.hardcoverListId / list.openLibraryListId
  memberRemoteId: (m: { hardcoverBookId?: number; openLibrarySeed?: string }) => Id | undefined;
  push: (list: SavedList) => Promise<{ missing: string[] }>;       // copyToHardcover / copyToOpenLibrary with () => {}
  fetch: (remoteListId: string | number) => Promise<{ items: Item[]; total: number }>;
  itemId: (item: Item) => Id;
  remove: (remoteListId: string | number, id: Id) => Promise<void>;
  reconcile: (members: ListMember[], items: Item[], list: SavedList) => ListMember[];
  skipped: (items: Item[], next: ListMember[]) => string[];
}
export function syncLinkedList<Item, Id extends string | number>(list: SavedList, s: LinkedListService<Item, Id>): Promise<{ missing: string[]; skipped: string[] }>;
```

  Each adapter casts the `string | number` it receives back to its own type (`as number` for Hardcover, `as string` for Open Library); the value always comes from that same adapter's `remoteListId`.
- Consumes: `copyToHardcover`, `copyToOpenLibrary`, `reconcile`, `reconcileOpenLibrary`, `unlanded` (keep it in `openLibraryLists.ts`), and the API client calls already imported by each file.

`syncLinkedList` is today's `syncWithHardcover` body with the service-specific parts read from `s`, in this order — keep it:
1. no remote id → throw `` `This list isn't linked to ${s.name}.` ``
2. `const { missing } = await s.push(list)`
3. re-read with `getList`; gone → throw `"This list no longer exists."`
4. pending = removed members with a remote id that no live member shares (by remote id or by `type`+`id`)
5. fetch; `items.length < total` → throw `` `${s.name} sent only part of this list, so nothing was removed. Try again later.` ``
6. for each **distinct** remote id among `items` that is pending → `s.remove` (the `Set` gives Review Focus 5)
7. `next = s.reconcile(latest.members, items.filter(not pending), latest)`; `applyPulledMembers(latest, next)`; `settleRemovals(list.id, s.settle)`
8. return `{ missing, skipped: s.skipped(keptItems, next) }`

Adapters: Hardcover maps `fetchHardcoverList` → `{ items: books, total: booksCount }`, `skipped` = titles of items without `isbn`; Open Library maps `fetchOpenLibraryList` → `{ items: seeds, total: seedCount }`, `reconcile` passes `list.kind`, `skipped` = `unlanded(items, next)`.

- [ ] **Step 1: Write the failing test** in `hardcoverLists.test.ts`, next to the other `syncWithHardcover` tests:

```ts
it("syncWithHardcover deletes a pending remote book once, even if the remote lists it twice", async () => {
  // set up a linked list (hardcoverListId: 5) whose removedMembers holds { type: "book", id: "9780141439518", hardcoverBookId: 9 }
  // with no live member using 9, then:
  fetchList.mockResolvedValue({ name: "A", description: "", booksCount: 2, books: [
    { hardcoverBookId: 9, isbn: "9780141439518", title: "P&P" },
    { hardcoverBookId: 9, isbn: "9780141439518", title: "P&P" },
  ] });
  await syncWithHardcover((await getList(l.id))!);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledWith(5, 9);
});
```

  Build `removedMembers` the way the existing "finishes a pending remote delete" tests do (add a member with `hardcoverBookId: 9`, then `removeFromList`).
- [ ] **Step 2: Run it to see it fail.** `npx vitest run src/hardcoverLists.test.ts -t "once"` (in `apps/app`) → FAIL, `remove` called 2 times.
- [ ] **Step 3: Add `LinkedListService` and `syncLinkedList` to `listSync.ts`; make `syncWithHardcover` and `syncWithOpenLibrary` one-call wrappers** that pass their adapter. Keep their exported names and signatures — `app/lists/[id].tsx` and the tests call them.
- [ ] **Step 4: Run the sync suites.** `npx vitest run src/hardcoverLists.test.ts src/openLibraryLists.test.ts src/listSync.test.ts` → all PASS, including every pre-existing test, unchanged.
- [ ] **Step 5: Typecheck.** `npm run typecheck` (repo root) → no errors.
- [ ] **Step 6: Commit**

```bash
git add apps/app/src/listSync.ts apps/app/src/hardcoverLists.ts apps/app/src/openLibraryLists.ts apps/app/src/hardcoverLists.test.ts
git commit -m "refactor(app): one pull-and-reconcile for Hardcover and Open Library sync"
```

---

### Task 3: Read every saved book and work in one storage call

**Files:**
- Modify: `apps/app/src/test/asyncStorageMock.ts` (add `multiGet`)
- Modify: `apps/app/src/storage/savedBooks.ts:190-200` (`getAllSavedBooks`; delete `getSavedBookRaw` once unused)
- Modify: `apps/app/src/storage/savedWorks.ts:138-144` (`getAllSavedWorks`, same pattern)
- Test: `apps/app/src/storage/savedBooks.test.ts`

**Interfaces:**
- Consumes: `enqueueWrite(key, write)` from `storage/writeQueue.ts`.
- Produces: `getAllSavedBooks(): Promise<SavedBookRecord[]>` and `getAllSavedWorks(): Promise<SavedWorkRecord[]>`, signatures unchanged.

Approach for both: get the prefixed keys; wait for each key's queue to drain with `enqueueWrite(key, async () => {})` (no storage I/O, keeps Review Focus 3); then one `AsyncStorage.multiGet(keys)`; parse each value with the same try/catch `readRecord` uses, dropping `null` values and bad JSON (Review Focus 2 and 4). Keep tombstones — the snapshot needs them.

- [ ] **Step 1: Add `multiGet` to the mock**, yielding to the event loop once like the other methods: `multiGet: async (keys: readonly string[]) => { await io(); return keys.map((k) => [k, store.get(k) ?? null] as [string, string | null]); }`.
- [ ] **Step 2: Write the failing tests** in `savedBooks.test.ts` (import `getAllSavedBooks`, and `AsyncStorage` is already the mock):

```ts
it("getAllSavedBooks reads every record in one multiGet, tombstones included", async () => {
  await saveBook(book);
  await saveBook({ ...book, isbn: "9780306406157" });
  await unsaveBook("9780306406157");
  const getItem = vi.spyOn(AsyncStorage, "getItem");
  const multiGet = vi.spyOn(AsyncStorage, "multiGet");
  const all = await getAllSavedBooks();
  expect(all.map((r) => r.isbn).sort()).toEqual(["9780141439518", "9780306406157"]);
  expect(all.find((r) => r.isbn === "9780306406157")?.deletedAt).toBeDefined();
  expect(multiGet).toHaveBeenCalledTimes(1);
  expect(getItem).not.toHaveBeenCalled();
});

it("getAllSavedBooks skips a damaged record and sees a write still in flight", async () => {
  await saveBook(book);
  await AsyncStorage.setItem("book-explorer:saved-book:9780306406157", "{not json");
  const pending = updateSavedBook(book.isbn, { notes: "fresh" }); // not awaited
  const all = await getAllSavedBooks();
  await pending;
  expect(all).toHaveLength(1);
  expect(all[0].notes).toBe("fresh");
});
```

  Restore spies with `vi.restoreAllMocks()` in the existing `beforeEach` if the file doesn't already.
- [ ] **Step 3: Run them to see them fail.** `npx vitest run src/storage/savedBooks.test.ts -t getAllSavedBooks` → the first FAILS (`getItem` called, `multiGet` 0 times).
- [ ] **Step 4: Rewrite `getAllSavedBooks` and `getAllSavedWorks`** as described above; delete `getSavedBookRaw` if nothing else uses it (`grep -rn getSavedBookRaw apps/app` → only the definition).
- [ ] **Step 5: Run the app suite.** `npm test --workspace=apps/app` → all PASS (snapshot, backup and prefetch tests exercise both functions).
- [ ] **Step 6: Typecheck.** `npm run typecheck` → no errors.
- [ ] **Step 7: Commit**

```bash
git add apps/app/src/test/asyncStorageMock.ts apps/app/src/storage/savedBooks.ts apps/app/src/storage/savedWorks.ts apps/app/src/storage/savedBooks.test.ts
git commit -m "perf(app): read all saved books and works with one multiGet"
```

---

## Additions (same day)

**Why the book page is slow** (measured 2026-11-13, uncached *The Brothers Karamazov*, 9780374528379; total 40.8 s):
- 31.5 s: Library of Congress SRU at `https://lx2.loc.gov/sru/lcdb` — connect timeout (10.5 s) × 3 attempts by `fetchWithTimeout`. The documented `http://lx2.loc.gov:210/lcdb` answers the same query in 0.18 s.
- ~6 s: 60 `id.loc.gov/authorities/subjects/suggest2` calls from subject canonicalization (cached afterwards; persisted only when `CACHE_DB_PATH` is set).
- ~2.7 s: everything else (Open Library, Hardcover, Wikidata, Google Books).

Library availability is *not* a cause: it is already its own request, fired only after the book renders (`app/book/[isbn].tsx:257` → `LibraryAvailability`'s `useQuery`), and takes 0.3–1 s. No app change is needed for it.

### Task 4: UMD record links use the `01USMAI_UMCP:UMCP` view

**Files:**
- Modify: `apps/server/src/sources/almaSru.ts` (`recordUrl` of the `umd` entry)
- Test: `apps/server/src/sources/almaSru.test.ts` (the "reads a checked-out holding" expectation)

**Interfaces:** none change.

- [ ] **Step 1: Update the test's expected `recordUrl`** to `"https://usmai-umcp.primo.exlibrisgroup.com/discovery/fulldisplay?docid=alma990001199870108238&vid=01USMAI_UMCP:UMCP"`.
- [ ] **Step 2: Run it to see it fail.** `npx vitest run src/sources/almaSru.test.ts` (in `apps/server`) → FAIL, got `vid=01USMAI_UMCP:DEFAULT`.
- [ ] **Step 3: Change the `umd` entry's `recordUrl` to `vid=01USMAI_UMCP:UMCP`.**
- [ ] **Step 4: Run it to see it pass**, then `grep -rn "UMCP:DEFAULT" apps docs` → no hits.
- [ ] **Step 5: Commit on `fix/remove-mbln`**

```bash
git add apps/server/src/sources/almaSru.ts apps/server/src/sources/almaSru.test.ts
git commit -m "fix(server): link UMD records in the UMCP Primo view"
```

---

### Task 5: Query the Library of Congress at its documented SRU address

**Files:**
- Modify: `apps/server/src/sources/loc.ts:5-12` (`SRU_URL` and the comment above it)

**Interfaces:** none change.

The data is public and read-only, so plain HTTP on port 210 carries no secret; the comment must say so, and that the HTTPS path stopped answering (connect timeouts, 2026-11-13) while port 210 kept working.

- [ ] **Step 1: Set `SRU_URL = "http://lx2.loc.gov:210/lcdb"`** and rewrite the comment: documented address, why HTTPS is no longer used, public data only.
- [ ] **Step 2: Run the LoC tests.** `npx vitest run src/sources/loc.test.ts` (in `apps/server`) → PASS (they parse fixtures and don't pin the URL).
- [ ] **Step 3: Check live.** `curl -s -m 10 -o /dev/null -w "%{http_code} %{time_total}\n" "http://lx2.loc.gov:210/lcdb?version=1.1&operation=searchRetrieve&query=bath.isbn%3D9780374528379&maximumRecords=1&recordSchema=mods"` → `200` well under 1 s. Then, on a fresh dev server (`npm run dev:server`, no `CACHE_DB_PATH`), `time curl -s -o /dev/null -H "x-app-key: $APP_SHARED_SECRET" http://localhost:3001/api/books/isbn/9780374528379` → about 10 s or less, not 40.
- [ ] **Step 4: Commit**

```bash
git add apps/server/src/sources/loc.ts
git commit -m "fix(server): use LoC's documented SRU address; the HTTPS path stopped answering"
```

---

### Task 6: An optional Library of Congress lookup can't hold a page for more than 5 seconds

**Files:**
- Modify: `apps/server/src/services/bookEnrichment.ts` (`startCommonEnrichment`'s `locMetadataPromise`; add `LOC_BUDGET_MS` and `withinBudget`)
- Test: `apps/server/src/services/bookEnrichment.test.ts` (create if absent; follow the `vi.mock` style of `bookService.test.ts`)

**Interfaces:**
- Produces, in `bookEnrichment.ts`:
  - `export const LOC_BUDGET_MS = 5_000;`
  - `export function withinBudget<T>(promise: Promise<T>, ms: number, fallback: T, onLate: () => void): Promise<T>` — resolves with `promise`'s value if it settles within `ms`, else with `fallback` after calling `onLate()` once; clears its timer either way.
- Consumes: `optionalSource`, `DEGRADED_TTL_MS`, `EMPTY_METADATA`.

Both book and work pages await `locMetadataPromise`; a work tries up to 5 edition ISBNs one after another, so an unreachable LoC could cost a work page minutes. Wrap the existing promise: `withinBudget(fetchMetadataByAnyIsbn(...).catch(optionalSource(entry, "loc", EMPTY_METADATA)), LOC_BUDGET_MS, EMPTY_METADATA, () => { entry.ttlMs = Math.min(entry.ttlMs, DEGRADED_TTL_MS); console.warn("[loc] Over budget; serving without LoC headings"); })`. The shortened TTL means the page is rebuilt with LoC headings within 5 minutes instead of caching their absence for an hour.

- [ ] **Step 1: Write the failing tests** (fake timers):

```ts
it("withinBudget returns the value when it arrives in time", async () => {
  const onLate = vi.fn();
  await expect(withinBudget(Promise.resolve("ok"), 5_000, "fallback", onLate)).resolves.toBe("ok");
  expect(onLate).not.toHaveBeenCalled();
});

it("withinBudget serves the fallback and reports lateness when the budget runs out", async () => {
  vi.useFakeTimers();
  const onLate = vi.fn();
  const result = withinBudget(new Promise<string>(() => {}), 5_000, "fallback", onLate);
  await vi.advanceTimersByTimeAsync(5_000);
  await expect(result).resolves.toBe("fallback");
  expect(onLate).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});

it("a hung LoC lookup costs a book at most LOC_BUDGET_MS and shortens its cache TTL", async () => {
  // mock ../sources/loc.js fetchMetadataByAnyIsbn → never-settling promise; call startCommonEnrichment(["9780374528379"], null, entry)
  // with entry = { ttlMs: 3_600_000 }; advance fake timers by LOC_BUDGET_MS
  // expect(await locMetadataPromise).toEqual(EMPTY_METADATA); expect(entry.ttlMs).toBe(DEGRADED_TTL_MS)
});
```

- [ ] **Step 2: Run them to see them fail.** `npx vitest run src/services/bookEnrichment.test.ts` → FAIL, `withinBudget` not exported.
- [ ] **Step 3: Add `LOC_BUDGET_MS` and `withinBudget`; wrap `locMetadataPromise` as above.**
- [ ] **Step 4: Run the server suite.** `npm test --workspace=apps/server` → all PASS (book and work service tests resolve LoC mocks immediately, so they stay within budget).
- [ ] **Step 5: Typecheck.** `npm run typecheck` (repo root) → no errors.
- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/bookEnrichment.ts apps/server/src/services/bookEnrichment.test.ts
git commit -m "fix(server): cap the optional LoC lookup at 5 s so it can't hold book and work pages"
```

**Review Focus additions:**
6. LoC answers in 4.9 s: its headings are used, and the page is cached for the full hour (not degraded). Covered by Task 6's first test plus `withinBudget` only degrading on timeout.
7. LoC fails fast (cooldown, DNS error) well inside the budget: behavior is today's `optionalSource` path, unchanged — no double warning, TTL degraded once.
