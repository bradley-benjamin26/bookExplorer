# UX Feedback Round 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 22 fixes in the spec: lists replace saves, series fixes and covers, better recommendations, share links and social cards, graph usability, and layout and header cleanups.

**Architecture:** Each change has its logic in a pure, testable module under `apps/app/src` or `apps/server/src`, and the screens only wire it in. Saving becomes "being on a list": every list member keeps its existing saved record (notes, tags, offline cache, recommendation seeds), so those features keep working without a rewrite. Social cards come from a new Fastify route that Caddy calls only for link-preview crawlers.

**Tech Stack:** Expo SDK 57 / Expo Router / React Native Web, TanStack Query, Fastify 5, zod, vitest.

**Spec:** `docs/superpowers/specs/2026-10-26-ux-feedback-round-3.md` (item numbers below cite it).

## Global Constraints

- Read the Expo docs for v57 (`https://docs.expo.dev/versions/v57.0.0/`) before writing Expo code (`apps/app/AGENTS.md`).
- No new npm dependencies.
- Exact copy: "Save to list", "Cancel", "Done", "All lists", "Not enough books or authors to make recommendations", "Import & Export", "Find Connection", "My Library → Settings".
- The user's own tags never leave the device (existing rule in `apps/app/src/recommendations.ts`). Recommendation and social-card requests use only API-sourced terms and ids.
- Test runners: app `cd apps/app && npx vitest run <file>`; server `cd apps/server && npx vitest run <file>`. Whole repo: `npm run typecheck && npm test` from the root.
- Screens are not unit-tested in this repo. Logic goes in a pure module with a test beside it, and each screen task ends with a by-eye check on web: `npm run dev:server` plus `cd apps/app && npx expo start --web`, at 390×844 and at desktop width, in light and dark.
- One commit per task, on branch `ux-feedback-round-3`, with each commit message ending in the attribution line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Existing users' saves vanish when Save goes away.** Anything saved before this release but on no list must show up on a list after the upgrade, and also after importing an old backup. *Test: Task 5, `withListedSaves`.*
2. **Moving an item from one list to another deletes its notes.** Removing an item from its last list unsaves it (that's the spec), so a move must apply the adds before the removes. *Test: Task 5, "moving between lists keeps the record".*
3. **A series lookup links to the wrong book.** If a member has no author, a title-only Open Library search can match an unrelated book, so in that case skip the search and keep Wikidata's id. *Test: Task 3.*
4. **Social tags carry hostile text.** Titles and descriptions come from public wikis, so a `"` or `<script>` must be escaped, not injected. *Test: Task 17.*
5. **Share links on a dev or preview host.** On web the link uses the current origin; on native it uses https://shelfthread.com. *Test: Task 11.*

---

### Task 1: Merge graph-list-a11y (item 19)

**Files:**
- Conflicts (from a dry run): `apps/app/app/graph/[type]/[id].tsx`, `apps/app/src/recommendations.ts`, `apps/app/src/theme.ts`, `apps/app/src/theme.test.ts`, `apps/server/src/services/authorService.test.ts`, `apps/server/src/services/graphService.test.ts`

**Interfaces:**
- Produces: `connection.tsx` with the "Try Again" button on a timed-out search (commit fbc1681), and `apps/app/src/themeColors.ts` exporting `lightColors` and `darkColors` (later tasks read colors from `useTheme()` as before).

- [x] **Step 1: Branch and merge**

```bash
git checkout -b ux-feedback-round-3 main
git merge graph-list-a11y
```
Expected: CONFLICT in the 6 files listed above.

- [x] **Step 2: Resolve each conflict**
  - `graph/[type]/[id].tsx` imports: take the union of the names the merged file uses from `graphLabels` (`legendEntries`, `NODE_LABELS`, `nodeRelations`, `pathAsGraph`, `relationLabel`). Drop `RELATION_LABELS` if nothing references it. For the `wrapLabel`/`shortenEdge` block, keep HEAD's deletion: they now live in `src/graphLayout.ts`.
    For the visible hint, both sides still tell screen-reader users about the list (HEAD line ~393 "Screen reader users get a list of every connection; switch with the List button.", the branch's "Tap a node to explore it. Screen reader users get…"). Keep only HEAD's first sentence visible: "Each circle is a book, author or subject. Tap one to move there; tap the center circle to open its page." Then set the graph container's `accessibilityHint` (now "Swipe to move between nodes. Activate the highlighted center node for full details.") to "Swipe to move between nodes. Activate the highlighted center node for full details. For a list of every connection, use the List button." This closes the old plan's Task 13 gap.
  - `recommendations.ts` imports: union (`normalizeTitle` and `QueryCacheNotifyEvent` both stay).
  - `theme.ts`/`theme.test.ts`: take the branch's split (palettes in `themeColors.ts`). Then copy main's palette values into `themeColors.ts`, so main's contrast fixes (commits a99bfb8 and 022f0e0) survive. Keep both test sets: main's `vi.mock("react-native")` preference tests and the branch's palette tests.
  - `authorService.test.ts` (add/add): keep every test from both sides in one file, with imports merged.
  - `graphService.test.ts`: `normalizeTitle` from `@book-explorer/shared` (main moved it there), `buildWorkLinksGraph, cleanGraph` from `./graphService.js`, and keep the branch's `vi.mock("./workService.js", …)`.

- [x] **Step 3: Verify**

Run: `npm run typecheck && npm test` (root). Expected: all pass.
Run: `git diff main -- apps/app/src/themeColors.ts apps/app/src/theme.ts | grep -E '^[-+].*#[0-9A-Fa-f]{6}'`. Expected: no hex value that main had is changed.

- [x] **Step 4: Commit** with `git commit --no-edit` (the merge message).

---

### Task 2: Series drops chapters and prologues (item 17)

**Files:**
- Modify: `apps/server/src/sources/wikidata.ts` (`fetchSeries`, ~line 441)
- Test: `apps/server/src/sources/wikidata.test.ts` (`describe("series lookups")`)

**Interfaces:**
- Produces: `fetchSeries(qid)` leaves out sub-parts of other members. (Live data: LOTR's six "books" have P361 pointing at their volume, and "Concerning Hobbits" is P31 Q920285, a prologue.)

- [x] **Step 1: Write the failing tests** (reuse the file's `stubWikidata`, `entity` and `seriesClaim` helpers)

```ts
it("leaves out a member that is part of (P361) another member, like a volume's inner books", async () => {
  const partOf = (id: string) => ({ P361: [{ mainsnak: { datavalue: { value: { id } } } }] });
  stubWikidata(
    {
      Q9: entity("The Lord of the Rings"),
      Q1: entity("The Fellowship of the Ring", { P179: [seriesClaim("Q9", "1")] }),
      Q11: entity("The First Journey", { ...partOf("Q1"), P179: [seriesClaim("Q9", "1")] }),
    },
    ["Q1", "Q11"]
  );
  expect((await fetchSeries("Q9"))?.members.map((m) => m.title)).toEqual(["The Fellowship of the Ring"]);
});

it("leaves out a prologue (P31 Q920285)", async () => {
  const instanceOf = (id: string) => ({ P31: [{ mainsnak: { datavalue: { value: { id } } } }] });
  stubWikidata(
    { Q9: entity("The Saga"), Q1: entity("One", { P179: [seriesClaim("Q9", "1")] }), Q2: entity("Prologue", { ...instanceOf("Q920285"), P179: [seriesClaim("Q9")] }) },
    ["Q1", "Q2"]
  );
  expect((await fetchSeries("Q9"))?.members.map((m) => m.title)).toEqual(["One"]);
});
```

- [x] **Step 2: Run** `cd apps/server && npx vitest run src/sources/wikidata.test.ts`. Expected: the 2 new tests FAIL (extra members listed).

- [x] **Step 3: Implement.** In `fetchSeries`, before mapping, drop a qid when `claimItemIds(entities[qid], "P361")` contains another member qid, or when `claimItemIds(entities[qid], "P31")` contains an id in `const NON_WORK_PARTS = new Set(["Q920285"]) // prologue`.

- [x] **Step 4: Run the tests.** Expected: PASS, including the existing series tests.

- [x] **Step 5: Commit** `fix(server): series leaves out a volume's inner books and prologues`

---

### Task 3: Series links to the right work and shows covers (items 2, 3)

**Files:**
- Modify: `packages/shared/src/index.ts` (`SeriesMemberSchema`, ~line 389)
- Modify: `apps/server/src/sources/wikidata.ts` (`fetchSeries` also returns each member's author name)
- Modify: `apps/server/src/sources/openLibrary.ts` (new `findWork`)
- Modify: `apps/server/src/services/seriesService.ts`
- Modify: `apps/app/src/components/WorkListSections.tsx` (`SeriesSection`)
- Test: `apps/server/src/sources/openLibrarySearch.test.ts`, new `apps/server/src/services/seriesService.test.ts`

**Interfaces:**
- Produces: `SeriesMember.coverUrl: string | null` (shared schema).
- Produces: `findWork(title: string, authorName: string): Promise<{ workId: string; coverUrl: string | null } | null>` in `openLibrary.ts`.
- Produces: `fetchSeries` returns `(SeriesMember-without-coverUrl & { authorName: string | null })[]` members. `getSeriesDetail` maps them to `Series` and strips `authorName`.

Why: Wikidata's P648 for Tehanu is OL59847W, which Open Library has merged twice and which now redirects to "Tales from Earthsea". So following the redirect is not enough. Searching Open Library by title plus author returns the right work (OL15056578W) and its `cover_i`. This was checked live for Earthsea and LOTR.

- [x] **Step 1: Write the failing tests**

`openLibrarySearch.test.ts`:
```ts
describe("findWork", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("searches by title and author and returns the first work with its cover", async () => {
    const fetch = mockSearchResponse([{ key: "/works/OL15056578W", title: "Tehanu (The Earthsea Cycle, Book 4)", cover_i: 3347790 }]);
    vi.stubGlobal("fetch", fetch);
    expect(await findWork("Tehanu", "Ursula K. Le Guin")).toEqual({ workId: "OL15056578W", coverUrl: "https://covers.openlibrary.org/b/id/3347790-M.jpg" });
    const url = new URL(fetch.mock.calls[0][0] as string);
    expect(url.searchParams.get("title")).toBe("Tehanu");
    expect(url.searchParams.get("author")).toBe("Ursula K. Le Guin");
  });
  it("returns null when nothing matches", async () => {
    vi.stubGlobal("fetch", mockSearchResponse([]));
    expect(await findWork("Nope", "Nobody")).toBeNull();
  });
});
```

`seriesService.test.ts` (mock `../sources/wikidata.js` `fetchSeries` and `../sources/openLibrary.js` `findWork` with `vi.mock`):
- `"links each member to the work Open Library finds by title and author, with its cover"`: fetchSeries returns a member `{ wikidataId: "Q2", title: "Tehanu", position: "4", openLibraryWorkId: "OL59847W", authorName: "Ursula K. Le Guin" }`, and findWork resolves `{ workId: "OL15056578W", coverUrl: "c" }`. Expect member `{ wikidataId: "Q2", title: "Tehanu", position: "4", openLibraryWorkId: "OL15056578W", coverUrl: "c" }`, with no `authorName` key.
- `"keeps Wikidata's id and no cover when the search finds nothing or fails"`: findWork resolves null for one member and rejects for another. Both keep their `openLibraryWorkId` and have `coverUrl: null`.
- `"does not search for a member with no author"`: `authorName: null` → findWork not called; Wikidata id kept.

- [x] **Step 2: Run** both test files. Expected: FAIL (`findWork` not exported; `seriesService` returns no `coverUrl`).

- [x] **Step 3: Implement**
  - `findWork`: `GET https://openlibrary.org/search.json` with `title`, `author`, `fields=key,cover_i` and `limit=1` (built with `URLSearchParams`), through `fetchWithTimeout` with `USER_AGENT`. Cover URL format: `https://covers.openlibrary.org/b/id/{cover_i}-M.jpg`. A non-ok response throws, as `searchWorks` does.
  - `fetchSeries`: read each member's first `P50` QID. Resolve every author label in one `resolveItems([...authorQids])` call and set `authorName` (null when there is none).
  - `SeriesMemberSchema`: add `coverUrl: z.string().nullable()`.
  - `getSeriesDetail`: `seriesCache.wrap(qid, async (entry) => …)`. Resolve members with at most 4 `findWork` calls in flight (a small worker loop like `mapWithConcurrency` in `apps/app/src/recommendations.ts`), because a long series can have up to 100 members. A rejected lookup goes through `optionalSource(entry, "openLibrary series lookup", null)` from `bookEnrichment.ts`, so the entry gets a shorter TTL.
  - `SeriesSection`: pass `coverUrl: m.coverUrl` into `WorkListRow`'s `work` (it already draws covers at 44×64).

- [x] **Step 4: Run** both test files, then `npm run typecheck` at the root. Expected: PASS.

- [x] **Step 5: Verify by eye:** /work/OL59798W lists the Earthsea books with covers, and "Tehanu" opens the real Tehanu. /work/OL27448W (LOTR) shows 3 volumes plus the appendices, with no six "books".

- [x] **Step 6: Commit** `fix(series): link members through Open Library search and show their covers`

---

### Task 4: Series found for titles carrying a series suffix (item 3)

**Files:**
- Modify: `apps/server/src/sources/wikidata.ts` (`searchWorkQid`, ~line 90)
- Test: `apps/server/src/sources/wikidata.test.ts`

Why: OL15056578W's title is "Tehanu (The Earthsea Cycle, Book 4)". Wikidata's search finds nothing for that string, but finds Q2261855 for "Tehanu".

- [x] **Step 1: Write the failing test.** `searchWorkQid("Tehanu (The Earthsea Cycle, Book 4)", "Ursula K. Le Guin")` with `fetch` stubbed to return `{ search: [{ id: "Q2261855", description: "1990 novel by Ursula K. Le Guin" }] }`. Assert the result is `"Q2261855"` and the request URL's `search` param is `"Tehanu"`.
- [x] **Step 2: Run.** Expected: FAIL on the `search` param.
- [x] **Step 3: Implement.** Search with `title.replace(/\s*\([^)]*\)\s*$/, "")`, falling back to the full title when that would leave it empty.
- [x] **Step 4: Run.** Expected: PASS. **By eye:** /work/OL15056578W now shows the Earthsea series.
- [x] **Step 5: Commit** `fix(server): match a work on Wikidata without its "(Series, Book N)" suffix`

---

### Task 5: Lists are saves: storage (item 4)

**Files:**
- Modify: `apps/app/src/storage/schema.ts` (`SCHEMA_VERSION = 4`, with a comment line `// 4: every saved item is on a list (lists replace saves)`)
- Modify: `apps/app/src/storage/savedLists.ts`, `savedItems.ts`, `savedBooks.ts`, `savedWorks.ts`, `snapshot.ts`, `apps/app/src/backup.ts` (`importSnapshot`)
- Create: `apps/app/src/storage/listMembership.ts`
- Test: `savedLists.test.ts`, `snapshot.test.ts`, new `listMembership.test.ts` (all mock AsyncStorage the way `savedLists.test.ts` does)

**Interfaces:**
- Produces (`savedLists.ts`):
  - `DEFAULT_LIST_NAMES: Record<SavedList["kind"], string> = { book: "Saved books", author: "Saved authors" }`
  - `newListId(): string` (the id format `createList` already uses; `createList` calls it)
  - `ensureOnAList(member: Omit<ListMember, "addedAt">): Promise<void>`: if no live list of the member's kind holds it, adds it to the live list named `DEFAULT_LIST_NAMES[kind]`, creating that list if needed. All of this runs inside one `enqueueWrite(KEY, …)`.
  - `isOnAnyList(type: ListMember["type"], id: string): Promise<boolean>`
- Produces (`savedItems.ts`): `saveAuthor(id: string, name: string): Promise<void>`, which calls `ensureSaved` and then `ensureOnAList`.
- Changes: `saveBook` and `saveWork` call `ensureOnAList` after `ensureSaved`, so batch scan and CSV import land on "Saved books".
- Produces (`listMembership.ts`):
  - `listChanges(lists: SavedList[], member: Pick<ListMember, "type" | "id">, checked: Set<string>): { add: string[]; remove: string[] }` (pure: list ids whose membership differs from `checked`)
  - `applyListChanges(member: Omit<ListMember, "addedAt">, changes: { add: string[]; remove: string[] }, save: () => Promise<unknown>): Promise<void>`: every `addToList` first, then `save()` if anything was added, then every `removeFromList`, then `unsaveIfUnlisted(member)`. Sequential; the first error is thrown.
  - `unsaveIfUnlisted(member): Promise<boolean>`: when the member is on no live list, calls `unsaveBook` (book), `unsaveWork` (work) or `removeSaved("author", id)`.
  - `deleteListAndUnsave(listId: string): Promise<void>`: reads the members, calls `deleteList`, then `unsaveIfUnlisted` for each member.
- Produces (`snapshot.ts`):
  - `withListedSaves(snapshot: Snapshot, now = Date.now()): Snapshot` (pure): each live item on no live list of its kind (book and work items go on book lists, authors on author lists) is appended to the default list, which is reused by name and kind or created with `stamp({ id: newListId(), … })`.
  - `migrateStorage` applies `withListedSaves(withWorkRecords(…))`, and `importSnapshot` wraps its result the same way.

- [x] **Step 1: Write the failing tests**
  - `snapshot.test.ts` `"v4 puts saved items that are on no list onto Saved books / Saved authors"`: store a saved book, a saved work and a saved author, plus a list "Faves" already holding the work. Run `migrateStorage()`. Expect a "Saved books" list with exactly the book, the work still only on "Faves", a "Saved authors" list with the author, and `schemaVersion` 4.
  - `snapshot.test.ts` `"withListedSaves reuses an existing Saved books list and skips tombstones"`.
  - `savedLists.test.ts` `"ensureOnAList twice at once creates one default list"`: `await Promise.all([ensureOnAList(dune), ensureOnAList(emma)])`, then expect one live "Saved books" list holding both.
  - `savedLists.test.ts` `"ensureOnAList leaves an item already on a list alone"`.
  - `listMembership.test.ts`:
    - `"listChanges diffs checked ids against current membership"`
    - `"applyListChanges saves on add and unsaves after removal from the last list"`: a spy `save`; after removing from the only list, `getSavedWork(id)` is null.
    - `"moving between lists keeps the record"`: `{ add: [b], remove: [a] }` → `getSavedWork` still returns the record, notes intact.
    - `"removing from one of two lists keeps the record"`
    - `"deleteListAndUnsave unsaves members on no other list only"`
  - Update the existing snapshot tests that assert `schemaVersion: 3` to expect 4.

- [x] **Step 2: Run** `cd apps/app && npx vitest run src/storage`. Expected: the new tests FAIL.
- [x] **Step 3: Implement** the interfaces above.
- [x] **Step 4: Run** `npx vitest run src/storage src/backup.test.ts`. Expected: PASS.
- [x] **Step 5: Commit** `feat(app): every saved item lives on a list; v4 migration lists existing saves`

---

### Task 6: Save to list replaces Save (items 4, 18 buttons)

**Files:**
- Modify: `apps/app/src/components/AddToListButton.tsx`, `apps/app/app/work/[id].tsx`, `apps/app/app/book/[isbn].tsx`, `apps/app/app/author/[id].tsx`, `apps/app/app/saved.tsx`, `apps/app/app/lists/[id].tsx`, `apps/app/app/lists/index.tsx`
- Test: `apps/app/src/storage/savedLists.test.ts` (Step 5)

**Interfaces:**
- Consumes: `listChanges`, `applyListChanges`, `deleteListAndUnsave` (Task 5).
- Produces: `AddToListButton({ member, onSave, onChange }: { member: Omit<ListMember, "addedAt">; onSave: () => Promise<unknown>; onChange?: () => void })`.

- [x] **Step 1: AddToListButton**
  - Trigger: `<Button variant="pill" starIcon active={onAnyList}>Save to list</Button>`. `onAnyList` is read on mount and on focus with `useFocusEffect` from `getLists(kind)`.
  - The sheet keeps a `checked: Set<string>` that starts from current membership. Tapping a row toggles only `checked`.
  - A footer row holds `Cancel` (pill: closes, discards) and `Done` (primary: `applyListChanges(member, listChanges(lists, member, checked), onSave)`, then `onChange?.()`, then close). On error the sheet stays open and shows the message.
  - "Create new list" still creates the list right away and adds its id to `checked`. Cancel keeps the new, empty list.
- [x] **Step 2: Pages**
  - Work: delete the Save button and `handleToggleSaved`. Pass `onSave={async () => { if (data.coverUrl) Image.prefetch(data.coverUrl, "disk"); return saveWork(data); }}` and `onChange` that re-reads `getSavedWork` (so the notes editor appears).
  - Book: the same with `saveBook(data)`. Replace the "Edit subjects, genres & notes in My Library" link with an inline `<SavedRecordEditor record={savedRecord} update={(c) => updateSavedBook(savedRecord.isbn, c)} onChange={setSavedRecord} />`, as the work page has.
  - Author: delete the Save button and `toggleSaved`. Add `<AddToListButton member={{ type: "author", id, title: data.name }} onSave={() => saveAuthor(id, data.name)} />`.
- [x] **Step 3: My Library (`saved.tsx`):** delete the Saved Books and Saved Authors sections, `BookRow` and the unused imports. The nav rows become, in order: Lists, Recommendations, Find Connection (`routes.connection()`, Task 10), Import & Export (`routes.backup()`, Task 9), Settings (`routes.settings()`). Rows for routes that don't exist yet are added by their own tasks.
- [x] **Step 4: Lists pages:** in `lists/[id].tsx`, Remove calls `applyListChanges(member, { add: [], remove: [id] }, async () => {})`, and Delete calls `deleteListAndUnsave(id)`. Change the "Add to list" copy in both lists pages' empty states to "Save to list".
- [x] **Step 5: Show list-read errors (old-plan review, Task 11).** These three places turn a storage failure into "no lists" or "This list no longer exists", and in the sheet that can lead the user to create a duplicate list:
  - [lists/index.tsx:25](apps/app/app/lists/index.tsx#L25), `.catch(() => setLists([]))`
  - [lists/[id].tsx:18](apps/app/app/lists/[id].tsx#L18), `.catch(() => setList(null))`
  - [AddToListButton.tsx:101](apps/app/src/components/AddToListButton.tsx#L101), `.catch(() => setLists([]))`

  Each catch instead sets an error string, "Couldn't load your lists. Try again." (on the detail page: "Couldn't load this list. Try again."). Show it in the existing `error` style with `accessibilityLiveRegion="polite"` and a "Retry" pill that calls `load` again. While the error shows:
  - The sheet hides its list rows and "Create new list", and Done is disabled.
  - The detail page shows the error instead of "This list no longer exists".

  First add the storage test this relies on, in `savedLists.test.ts`: `"getLists and getList reject when storage fails, instead of returning nothing"`. Stub `AsyncStorage.getItem` with `vi.spyOn(...).mockRejectedValueOnce(new Error("disk"))` and expect `getLists()` and `getList("x")` to reject. (Damaged JSON still returns `[]` inside `read()`, which is intended.) Run `npx vitest run src/storage/savedLists.test.ts`. It should pass already, which pins the behavior the screens now depend on. If it fails, make `read()` let `getItem` errors through.
- [x] **Step 6: Verify:** `npm run typecheck`. By eye: save a work to a new list, Cancel undoes toggles, Done applies them, the star fills, the notes editor appears; removing the work from its only list empties the star. For the error state, temporarily make `getLists` throw in dev, check that all three screens show the error and Retry, then revert the change.
- [x] **Step 7: Commit** `feat(app): Save to list replaces Save, with Cancel and Done; surface list-read errors`

---

### Task 7: Recommendations: loading, empty state, list picker (items 5, 6)

**Files:**
- Modify: `apps/app/src/storage/snapshot.ts` (new `snapshotForList`), `apps/app/src/recommendations.ts` (new `recommendationsStatus`), `apps/app/src/components/RecommendationsSection.tsx`, `apps/app/app/recommendations.tsx`
- Test: `apps/app/src/storage/snapshot.test.ts`, `apps/app/src/recommendations.test.ts`

**Interfaces:**
- Produces: `snapshotForList(snapshot: Snapshot, listId: string): Snapshot`: `items`, `books` and `works` limited to the members of that live list (book by `isbn`, work by `openLibraryWorkId`), `lists: [thatList]`, `libraries: []`. An unknown or deleted list gives empty arrays. (Task 9 reuses it.)
- Produces: `recommendationsStatus(s: { ready: boolean; seedCount: number; fetching: boolean; count: number }): "loading" | "empty" | "list"`. Order: `!ready` → loading; `seedCount === 0` → empty; `fetching && count === 0` → loading; `count === 0` → empty; otherwise list.
- Produces: `RecommendationsSection({ refreshKey, listId }: { refreshKey: unknown; listId: string | null })`.

- [x] **Step 1: Failing tests:** `snapshotForList` keeps only members (book, work and author, one of each type) and returns empty for a deleted list. `recommendationsStatus` gets one assertion per branch above.
- [x] **Step 2: Run.** Expected: FAIL.
- [x] **Step 3: Implement.**
  - `RecommendationsSection` applies `snapshotForList` when `listId` is set.
  - `ready = snapshot !== null && !useIsRestoring()` (from `@tanstack/react-query`, so the persisted cache has hydrated first). `seedCount = slugs.length + authorIds.length`.
  - "loading" renders `<ActivityIndicator color={theme.colors.cover} accessibilityLabel="Loading recommendations" />`. "empty" renders the text "Not enough books or authors to make recommendations" in the `emptyText` style `saved.tsx` uses.
  - `recommendations.tsx` loads `getLists()` on focus and renders a wrapping row of pills: "All lists" (`listId === null`) plus one per list, the active one `active`. This is the existing pill pattern used for Appearance and subject sort, instead of a native dropdown.
- [x] **Step 4: Run** the tests and typecheck. **By eye:** the spinner shows first; a list with one book shows the empty text; switching lists changes the results.
- [x] **Step 5: Commit** `feat(app): recommendations per list, with loading and empty states`

---

### Task 8: Recommendations draw from popular books, not the classic subject list (item 7)

**Files:**
- Modify: `apps/app/src/recommendations.ts`, `apps/app/src/components/RecommendationsSection.tsx`
- Test: `apps/app/src/recommendations.test.ts`

Why: `/api/subjects/{slug}` returns Open Library's subject order, which for juvenile fiction starts with Alice, A Christmas Carol and Hamlet. The subject page's "Most read" search (`subjectSortParams(name, "readinglog")`) returns Harry Potter, Diary of a Wimpy Kid and The Hunger Games.

**Interfaces:**
- Produces: `loadSubjectBooks(label: string, slug: string, deps: { searchSorted: (params: Record<string, string>) => Promise<WorkRef[] | null>; classic: (slug: string) => Promise<{ books: WorkRef[] } | null> }): Promise<{ books: WorkRef[] } | null>`. It uses the `subjectSortParams(label, "readinglog")` search, and the classic listing only when the search returns nothing or null.
- Changes: `rankRecommendations`' `subjectResults` type becomes `Map<string, { books: WorkRef[] }>`.

- [x] **Step 1: Failing tests:** `"prefers the most-read listing"` (classic is not called) and `"falls back to the classic listing when the search is empty"`.
- [x] **Step 2: Run.** Expected: FAIL.
- [x] **Step 3: Implement.** `RecommendationsSection`'s queryFn calls `loadSubjectBooks(s.label, s.slug, …)` with `searchSorted = (p) => fetchOne(["search", p], () => searchBooks(p))` (the subject page's cache key) and `classic = (slug) => fetchOne(["subject", slug], () => fetchSubject(slug))`. This needs `profile.subjects` (labels), not just slugs.
- [x] **Step 4: Run** the tests and typecheck. **By eye:** recommendations from a library of children's books show recent titles.
- [x] **Step 5: Commit** `fix(app): recommendations use each subject's most-read books`

---

### Task 9: Import & Export page, and list export buttons (items 8, 9)

**Files:**
- Create: `apps/app/app/backup.tsx`
- Modify: `apps/app/app/settings.tsx` (remove `<BackupSection>`), `apps/app/app/_layout.tsx` (a `backup` screen titled "Import & Export"), `apps/app/src/navigation.ts` (`backup: (): Href => "/backup"`), `apps/app/app/saved.tsx` (nav row), `apps/app/src/csv.ts`, `apps/app/src/backup.ts`, `apps/app/app/lists/[id].tsx`
- Test: `apps/app/src/csv.test.ts`, `apps/app/src/backup.test.ts`

**Interfaces:**
- Consumes: `snapshotForList` (Task 7).
- Changes: `booksToCsv(books: SavedBookRecord[], lists: SavedList[], works: SavedWorkRecord[] = [])`. Works become rows with empty ISBN cells and shelves from the book lists holding `{ type: "work", id }`. (Lists made from work pages hold works, so without this a list's CSV would come out empty.) `exportCsv` passes `works`.
- Produces: `exportListJson(listId: string): Promise<string>` (`snapshotForList` → the same `SnapshotExportSchema` check as `exportJson`) and `exportListCsv(listId: string): Promise<string>`.

- [x] **Step 1: Failing tests:**
  - csv: `"a saved work is a row with no ISBN, shelved by its lists"`.
  - backup: `"exportListJson holds only that list and its members, and re-imports"`: `parseSnapshotJson(await exportListJson(id))` succeeds and has one list.
  - backup: `"exportListCsv lists the list's books and works only"`.
- [x] **Step 2: Run.** Expected: FAIL.
- [x] **Step 3: Implement.**
  - `backup.tsx` renders `<BackupSection onImported={() => {}} />` and `<Footer />` in a ScrollView styled like `settings.tsx`. Settings loses the section and keeps its own reload on focus.
  - List page: below the members, a row of two pills, "Export CSV" and "Export JSON", that call `shareFile(\`${slug}-${today}.csv\`, await exportListCsv(id), "text/csv")` and the JSON equivalent. Reuse `BackupSection`'s `today()` and slug logic by exporting them from where they are defined, and show errors the way `BackupSection`'s `attempt` does.
- [x] **Step 4: Run** the tests and typecheck. **By eye:** My Library → Import & Export works; a list downloads both files.
- [x] **Step 5: Commit** `feat(app): Import & Export page and per-list export`

---

### Task 10: Find Connection from My Library (item 10)

**Files:**
- Modify: `apps/app/app/connection.tsx`, `apps/app/src/navigation.ts`, `apps/app/app/saved.tsx`
- Create: `apps/app/src/connectionSteps.ts`; Test: `apps/app/src/connectionSteps.test.ts`

**Interfaces:**
- Changes: `routes.connection(from?: string, label?: string): Href`. With no `from` it returns `"/connection"`. Existing callers are unchanged.
- Produces: `connectionStep(from: string | undefined, start: WorkRef | null, target: WorkRef | null): "pickStart" | "pickTarget" | "result"`.

- [x] **Step 1: Failing test:** the three cases, from a work page (`from` set → `pickTarget`, then `result`) and from My Library (nothing → `pickStart` → `pickTarget` → `result`).
- [x] **Step 2: Run.** Expected: FAIL.
- [x] **Step 3: Implement.**
  - `connection.tsx` keeps a `start` state used when `from` is absent. The effective `from` is ``params.from ?? (start && `work:${start.openLibraryWorkId}`)`` and the label is `params.label ?? start?.title`. The search list header reads "Choose the first book" in `pickStart`, otherwise "Connect {label} to…".
  - Replace the one-line explainer with a "How it works" header and this text: "Pick two books. Shelf Thread searches outward from the first: through its authors, subjects, series, and the writers who influenced them, up to 4 steps away, until it reaches the second. You'll see up to three connections, best first, and can open each one on the graph. A search can take up to 25 seconds."
  - The result page gets "Start Over" (shown only when `from` came from `start`), which clears `start` and `target`.
  - My Library row: "Find Connection" → `routes.connection()`.
- [x] **Step 4: Run** the test and typecheck. **By eye:** both entry points work, and Try Again (Task 1) still shows on a timeout.
- [x] **Step 5: Commit** `feat(app): Find Connection from My Library, picking both books`

---

### Task 11: Share copies the page's link; graph toolbar alignment (items 13, 14)

**Files:**
- Modify: `apps/app/src/share.ts`, `apps/app/src/share.test.ts`, `apps/app/src/components/ShareButton.tsx`, the `ShareButton` callers in `app/work/[id].tsx`, `app/book/[isbn].tsx`, `app/author/[id].tsx`, `app/subject/[slug].tsx` and `app/graph/[type]/[id].tsx`

**Interfaces:**
- Produces: `WEB_ORIGIN = "https://shelfthread.com"`, and `webUrl(href: Href, origin: string = globalThis.location?.origin ?? WEB_ORIGIN): string`. It uses the path and query `schemeUrl` builds today, under `origin`.
- Removes: `schemeUrl`, `shareMessage`, `openLibraryUrl` (unused afterwards).
- Changes: `ShareButton({ title, href, style }: { title: string; href: Href; style?: StyleProp<ViewStyle> })`.

- [x] **Step 1: Failing tests:** replace the `schemeUrl` table with a `webUrl` table using the same hrefs and `origin` = `"https://shelfthread.com"` (for example `routes.graph("work", "OL64034W")` → `"https://shelfthread.com/graph/work/OL64034W"`, and the subject-escaping case). Add `"uses the given origin"` with `"http://localhost:8081"`. Keep the `shareFeedback` tests.
- [x] **Step 2: Run.** Expected: FAIL.
- [x] **Step 3: Implement.**
  - Native: `Share.share({ message: url, url })`. Web: `navigator.share({ title, url })`, or else `navigator.clipboard.writeText(url)`.
  - `ShareButton` returns a `View` wrapping the Button and puts the status `Text` at `position: "absolute", top: "100%"`, so the "Link copied" text never shifts the row. Remove the hardcoded `marginTop: 8`. Callers that relied on it (book, author and subject pages) pass `style={{ marginTop: 8 }}`.
  - Graph toolbar: with the margin gone, Filter, List/Graph and Share share one baseline.
- [x] **Step 4: Run** the tests and typecheck. **By eye:** copying on the graph page gives exactly `https://…/graph/work/OL64034W`; the three toolbar pills line up.
- [x] **Step 5: Commit** `fix(app): Share copies just the page link; graph toolbar aligned`

---

### Task 12: Graph nodes look pressable; list rows open the item page (items 11, 16)

**Files:**
- Modify: `apps/app/src/navigation.ts` (new `nodeHref`), `apps/app/app/graph/[type]/[id].tsx`
- Test: `apps/app/src/navigation.test.ts`

**Interfaces:**
- Produces: `nodeHref(nodeId: string): Href | null`: author → `routes.author`, subject and genre → `routes.subject`, work → `routes.work`, editions → `routes.work(id, { highlight: "editions" })`, any `:qid:` id → null. `handleNodePress`'s center branch and genre/editions branches use it.

- [x] **Step 1: Failing test:** one assertion per node type, plus `"author:qid:Q1"` → null.
- [x] **Step 2: Run.** Expected: FAIL.
- [x] **Step 3: Implement.**
  - **Shadow (11):** replace the 8% ink circle with `<Circle cx={node.x} cy={node.y + 3} r={radius + 1} fill="#000" opacity={opacity * 0.25} />`. Black, so it stays a shadow in dark mode where `ink` is light. Navigable nodes' overlay Pressables get `cursor: "pointer"` in their style.
  - **List view (16):** a row's press opens `nodeHref(node.id)`. Each row ends with a `ChevronRight` and shows a muted second line "Open {type} page" (type from `NODE_LABELS`, lowercased). `accessibilityHint` becomes "Opens this item's page". Re-centering moves to a trailing icon button (`Crosshair` from lucide) labeled "Center graph on {label}", hidden for the center row and for non-navigable rows. The list heading gains "Tap an item to open its page."
- [x] **Step 4: Run** the test and typecheck. **By eye:** nodes look raised in light and dark; list rows open their pages; the crosshair re-centers.
- [x] **Step 5: Commit** `feat(app): raised graph nodes; list rows open the item's page`

---

### Task 13: Hover text (item 12)

**Files:**
- Create: `apps/app/src/webTitle.ts`; Test: `apps/app/src/webTitle.test.ts`
- Modify: `apps/app/src/components/Button.tsx`, `MyLibraryButton.tsx`, `NewSearchButton.tsx`, `ShareButton.tsx`, `AddToListButton.tsx`, `apps/app/app/index.tsx`, `apps/app/app/work/[id].tsx`, `apps/app/app/book/[isbn].tsx`, `apps/app/app/author/[id].tsx`, `apps/app/app/graph/[type]/[id].tsx`, `apps/app/app/lists/[id].tsx`

**Interfaces:**
- Produces: `titleRef(text: string | undefined): (el: unknown) => void`, a callback ref that sets the DOM `title` attribute when `el` has `setAttribute` (React Native Web host nodes). It does nothing on native, so it needs no `Platform` import.
- Changes: `Button` gains `tooltip?: string`, passed as `ref={titleRef(tooltip)}` on its Pressable.

- [x] **Step 1: Failing test:** a fake `{ setAttribute: vi.fn() }` gets `("title", "Zoom in")`; `null`, a native-like object without `setAttribute`, and an `undefined` text are no-ops.
- [x] **Step 2: Run.** Expected: FAIL.
- [x] **Step 3: Implement and apply this copy:**

| Control | Hover text |
|---|---|
| Home scan | Scan a book's barcode |
| Home search icon | Search |
| My Library (shelf) | My Library |
| New search | New search |
| Share | Copy a link to this page |
| Save to list | Save to one of your lists |
| View as Graph | See this book's authors, subjects and links as a graph |
| Find Connection | Find how this book links to another |
| Graph: Filter | Choose what the graph shows |
| Graph: List / Graph | Show as a list / Show as a graph |
| Graph: zoom in / out / reset | Zoom in / Zoom out / Fit the whole graph |
| Graph: back | Back to the previous graph |
| Graph node (center) | Open {label} |
| Graph node (other) | Center the graph on {label} |
| Graph node (not navigable) | {label} has no page yet |
| Graph list row / crosshair | Open {label} / Center graph on {label} |
| List: Export CSV / Export JSON | Download for Goodreads or StoryGraph / Download a backup of this list |
| List: Remove | Remove from this list |

- [x] **Step 4: Run** the test and typecheck. **By eye (web):** hovering each control shows its text.
- [x] **Step 5: Commit** `feat(app): hover text on buttons and graph nodes`

---

### Task 14: Work page layout (item 18)

**Files:** Modify `apps/app/app/work/[id].tsx`

- [x] **Step 1: Implement.**
  - Wrap the cover, title, author links and `RatingBadge` in a `View` with `{ alignItems: "center", width: "100%" }`, and center the title text with `textAlign: "center"`.
  - Below it, a centered row (`flexDirection: "row", justifyContent: "center", gap: spacing.sm, marginTop: spacing.md`) holds `ShareButton` and `AddToListButton` (the trigger loses its `marginTop: 8`).
  - Then View as Graph and Find Connection stay full width.
  - No other buttons sit above the sections; the sections below keep their left alignment.
- [x] **Step 2: Verify:** typecheck. By eye at both widths.
- [x] **Step 3: Commit** `feat(app): centered work page header with four actions`

---

### Task 15: Header and copy cleanups (items 20, 21, 22)

**Files:** Modify `apps/app/src/components/MyLibraryButton.tsx`, `HeaderActions.tsx`, `apps/app/app/_layout.tsx`, `apps/app/src/components/LibraryFindLinks.tsx`

- [x] **Step 1: Implement.**
  - `MyLibraryButton` always renders the shelf icon: delete the pill branch and the `iconOnly` prop, and update `HeaderActions`.
  - The `recommendations`, `settings`, `backup`, `lists/index` and `lists/[id]` screens use `inHeader(<HeaderActions />)`. `saved` keeps just New Search, since it is My Library itself.
  - Home screen options: `{ title: "Shelf Thread", headerTitle: "", headerRight: inHeader(<MyLibraryButton />) }`. The browser tab title stays, and the header text goes.
  - `LibraryFindLinks` hint: the text and label become "Add your library in My Library → Settings to see it here.", and the press goes to `routes.settings()`.
- [x] **Step 2: Verify:** typecheck. By eye: the shelf shows on home and every inner page; home shows one title.
- [x] **Step 3: Commit** `fix(app): shelf icon everywhere, one home title, settings hint path`

---

### Task 16: Footer sits at the bottom (item 1)

**Files:** Modify `apps/app/src/components/Footer.tsx`, plus every screen rendering `<Footer />`: `app/index.tsx`, `search.tsx`, `connection.tsx`, `saved.tsx`, `recommendations.tsx`, `settings.tsx`, `backup.tsx`, `lists/index.tsx`, `lists/[id].tsx`, `author/[id].tsx`, `subject/[slug].tsx`, `work/[id].tsx`, `book/[isbn].tsx`

- [x] **Step 1: Implement.**
  - Footer style adds `marginTop: "auto"`, `paddingTop: spacing.xl` and `alignSelf: "stretch"`. It stays centered.
  - ScrollView screens add `flexGrow: 1` to `contentContainerStyle`.
  - FlatList screens add `flexGrow: 1` to `contentContainerStyle` and pass `ListFooterComponentStyle={{ marginTop: "auto" }}`, because the footer wrapper is the flex child there.
  - The work page's `content` has `alignItems: "flex-start"`, so give the footer `alignSelf: "stretch"` there.
- [x] **Step 2: Verify by eye:** on short pages (an empty list, Settings) the footer rests at the bottom of the screen; on long pages it follows the content; it stays centered at desktop width.
- [x] **Step 3: Commit** `fix(app): footer rests at the bottom of short pages`

---

### Task 17: Social cards (item 15)

**Files:**
- Create: `apps/server/src/socialMeta.ts`, `apps/server/src/socialMeta.test.ts`, `apps/server/src/routes/og.ts`, `apps/app/public/index.html`, `apps/app/public/og-image.png` (a copy of `apps/app/assets/icon.png`), `docs/deploy-social-cards.md`
- Modify: `apps/server/src/appAuth.ts` (+ test), `apps/server/src/index.ts`, `apps/server/.env.example`

**Interfaces:**
- Produces (`socialMeta.ts`):
  - `interface PageMeta { title: string; description: string; image: string | null }`
  - `pageMeta(path: string): Promise<PageMeta | null>`. `/work/:id` (validated by `isOpenLibraryWorkId`) → `getWorkDetail`; `/book/:isbn` (`isValidIsbn`) → `getBookDetail`; `/author/:id` (`isOpenLibraryAuthorId`) → `getAuthorDetail` with image null; `/subject/:slug` (`isSubjectSlug`) → `getSubjectDetail`, with the first book's cover as image; `/graph/:type/:id` → the same lookup with the title prefixed "Explore ". Anything else, a failed lookup or a null detail → null.
  - Title rule: `"{title} by {authors joined with ', '}"` for works and books, the name for authors and subjects. Description: the item's description or bio cut at 200 characters on a word boundary with "…", or `"Explore {title} on Shelf Thread: its authors, subjects and connections."`.
  - `renderSocialTags(meta: PageMeta | null, url: string): string` emits `<title>{title} · Shelf Thread</title>` (just "Shelf Thread" for null), `description`, `og:site_name`, `og:type=website`, `og:title`, `og:description`, `og:url`, `og:image` (fallback `${WEB_ORIGIN}/og-image.png`), `twitter:card=summary`, `twitter:title`, `twitter:description` and `twitter:image`. Every value is HTML-escaped (`& < > " '`).
  - `injectSocialTags(html: string, tags: string): string` replaces everything between `<!-- social:start -->` and `<!-- social:end -->`, or inserts before `</head>` when the markers are missing.
- Produces (`appAuth.ts`): `isPublicPath(url: string): boolean`, true for `/health` and for anything starting with `/og/` (crawlers send no app key). `index.ts`'s hook uses it.
- Produces (`routes/og.ts`): `GET /og/*`, registered only when `WEB_INDEX_HTML` is set. It reads that file on each request and returns `injectSocialTags(html, renderSocialTags(await pageMeta(path), origin + path))` as `text/html` with `Cache-Control: public, max-age=3600`. `origin` comes from `PUBLIC_WEB_URL`, defaulting to `https://shelfthread.com`. If the page lookup throws, it serves the default tags rather than an error. A missing or unreadable `WEB_INDEX_HTML` file returns 500.

- [x] **Step 1: Failing tests** (`socialMeta.test.ts` mocks the four services with `vi.mock`):
  - `"work page: title with authors, cut description, cover image"`
  - `"graph path prefixes Explore"`
  - `"invalid id or unknown path → null, no service call"`
  - `"escapes quotes and tags in every value"`: a title `Dune "<script>"` comes out with no raw `<script` or unescaped `"`.
  - `"no meta → site defaults with og-image.png"`
  - `"injects between the markers, or before </head> without them"`
  - `appAuth.test.ts`: `isPublicPath("/og/work/OL1W")` and `isPublicPath("/health?x=1")` are true; `isPublicPath("/api/works/OL1W")` is false.
- [x] **Step 2: Run** `cd apps/server && npx vitest run src/socialMeta.test.ts src/appAuth.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement** the server side above. Add `WEB_INDEX_HTML` and `PUBLIC_WEB_URL` to `.env.example`, each with a one-line comment.
- [x] **Step 4: Web template.** Create `apps/app/public/index.html` with `npx expo customize public/index.html` (check the v57 docs first). Put the default tags (`renderSocialTags(null, "https://shelfthread.com/")`'s output, written by hand) between `<!-- social:start -->` and `<!-- social:end -->` in `<head>`, replacing its `<title>`. Copy `assets/icon.png` to `public/og-image.png`.
  Run: `cd apps/app && EXPO_PUBLIC_API_BASE_URL=https://api.example.invalid npx expo export --platform web && grep -c "social:start" dist/index.html && ls dist/og-image.png`
  Expected: `1`, and the file exists. If the markers are missing, stop and report: the SPA template mechanism differs from the docs.
- [x] **Step 5: Deploy doc** `docs/deploy-social-cards.md`:
  - Server env: `WEB_INDEX_HTML=/var/www/shelfthread/index.html`.
  - Caddy, in the shelfthread.com site block:
    ```
    @preview header_regexp ua User-Agent (?i)(twitterbot|facebookexternalhit|slackbot|discordbot|linkedinbot|whatsapp|telegrambot|redditbot|bluesky|mastodon|embedly|pinterest|skypeuripreview|iframely)
    handle @preview {
      rewrite * /og{uri}
      reverse_proxy 127.0.0.1:3001
    }
    ```
    Only crawlers hit the server, so people's page loads stay static and fast.
  - Cloudflare: today the site answers non-browser requests with a challenge (403, `cf-mitigated: challenge`), which also blocks these crawlers. Add a WAF custom rule "Skip" for `(cf.client.bot)` on shelfthread.com, or allow verified bots under Security → Bots.
  - How to check: `curl -A Twitterbot https://shelfthread.com/work/OL59798W | grep og:image`, then the X/Facebook card validators.
- [x] **Step 6: Run** `npm run typecheck && npm test` at the root. Expected: PASS.
- [x] **Step 7: Commit** `feat: link-preview cards for shared pages`

---

### Final check

- [x] Run `npm run typecheck && npm test` at the root, and `cd apps/app && EXPO_PUBLIC_API_BASE_URL=https://api.example.invalid npx expo export --platform web` (this is what CI runs). Expected: all pass.
- [ ] Walk the 22 spec items on web at 390×844, ticking each one.
- [x] **Old plan bookkeeping** (`docs/userReviewPlan.md`):
  - Change Review Focus #5 to say a list named `=HYPERLINK(...)` exports as the shelf slug `hyperlink-...`, because the slug rule removes every formula character, and that the raw-text cells (title, author, notes) keep the leading-`'` rule (tested in `csv.test.ts`, "neutralizes cells a spreadsheet would run as formulas"). Make the same change to Task 12 Step 1's third bullet.
  - Tick every step whose commit is on main (Tasks 1–15).
  - Commit `docs: reconcile userReviewPlan with what shipped`.
