# User Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the problems the simulated user studies found: noisy subject tags, untrustworthy results, ISBN-only recents, a crowded My Library, missing named lists, the CSV export bug, unexplained graph/Find Connection, and light/dark contrast problems.

**Architecture:** Data cleanup happens once on the server (a shared `splitSubjectTerms` helper plus a better dedupe key in `mergeTaggedTerms`), so book pages, work pages, saved records and recommendations all receive clean tags. Client work follows existing patterns: storage modules on AsyncStorage with `stamp`/`enqueueWrite`/tombstones, a snapshot schema bump for the new lists, Expo Router screens, and theme tokens in `src/theme.ts`.

**Tech Stack:** TypeScript, Fastify server (`apps/server`), Expo Router + React Native Web (`apps/app`), zod schemas in `packages/shared`, vitest.

**Spec:** [CompiledUserReview.md](CompiledUserReview.md). Section numbers like "§2.1" below point into it. The owner's original list is kept just below and also counts as spec.

### Owner's original list (now covered by the tasks)

| # | Item | Task |
|---|---|---|
| 1 | Separate pages under My Library for book recommendations | 9 |
| 2 | Remove "OL" and other source tags on subject terms | 2 |
| 3 | Drop Open Library's NYT best seller tags from subjects | 1 |
| 4 | Award subjects go in their own "Awards" section, like genres | 1, 2 |
| 5 | Sort book lists (e.g. `/subject/science-fiction`) by number of reviews, rating and recency | 5 |
| 6 | Named lists: a lists page, create a list (name + optional description) from "Add to list", books and authors kept separate | 10, 11 |
| 7 | Only the header stays on screen; the footer scrolls away | 8 |
| 8 | "Find your edition" puts recent and English editions first, with a small boost for editions that have a cover | 6 |
| 9 | "Recently looked at" on the home screen shows title and author instead of the ISBN | 7 |

### Decisions for the owner (defaults used unless you change them)

- **D1, app name (§2.2).** Bookweft tested poorly (Opus 5 of 6 said no). The most popular suggestions were Next Chapter (5 votes), Book Trail(s) (4) and Next Read (3). Every review noticed that the screen still says "Book Explorer". **Default:** keep "Book Explorer" and skip Task 15. If you pick a name, Task 15 applies it everywhere.

Please change the app name officially to Shelf Thread. Use shelfweb.com as its address. I have this domain but I do not have the applicaiton online.

- **D2, "Number of Reviews" sort (item 5).** Open Library's search can't sort by review count. The closest it offers is `readinglog` (how many readers have logged the book). **Default:** label it **"Most read"**, next to **"Top rated"** (`rating`) and **"Newest"** (`new`).
- **D3, default subject ordering (§2.3).** All six Opus participants objected to the default Open Library listing, which is ordered by edition count and so fills up with public-domain classics. **Default:** subject pages open on **"Most read"**. "Classic" (Open Library's own listing) stays as an option.

## Global Constraints

- The owner's principle is to store as little as possible off the device. Only public ids, ISBNs and subject slugs/names go to the server. List names, descriptions, notes and tags never leave the device, except in exports the user makes.
- Write tests alongside every behaviour change (vitest). In each workspace you touch, run `npx tsc --noEmit` and `npx vitest run`.
- WCAG 2.2 AA: text 4.5:1, control boundaries 3:1. New controls get `accessibilityRole`, a label and state. Headings use `accessibilityRole="header"`. Colours always come from theme tokens.
- Make the smallest correct change in the existing style. Reuse `stamp`, `Versioned`, `Unversioned`, `enqueueWrite`, `mergeBy`/`newer`, `routes`, `Button`, `WorkListRow` and `titleCase`.
- Expo SDK 57: check https://docs.expo.dev/versions/v57.0.0/ before you use any Expo API that is new to the codebase (`apps/app/AGENTS.md`).
- End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.

## Review Focus

1. **Existing saved data:** a backup from before Task 10 (schemaVersion 2, no `lists`) must still import, and an existing install must migrate with no lists and nothing lost. The tests for this belong to Task 10.
2. **Stale caches:** a client query cache or server cache written before Task 1 holds Book/Work objects with no `awards` field. The client must not throw a zod error on them. Task 1's `.default([])` handles this and Task 2's `CACHE_SCHEMA_VERSION` bump clears them. Task 1 includes a test that parses an awards-less Book.
3. **A real subject that contains a colon** (for example "Science fiction: history") must not be dropped by the machine-tag filter. The test for this is in Task 1.
4. **Legacy recents:** the home screen must keep working when the stored history is still the old `string[]` of ISBNs. It shows the ISBN until the book is opened again. The test is in Task 7.
5. **CSV injection and quoting still apply to the new columns:** a list named `=HYPERLINK(...)` must be exported with a leading `'`. The test is in Task 12.

---

### Task 1: Clean subject tags on the server, and split out awards (§2.1, items 3 and 4)

**Files:**
- Modify: `packages/shared/src/index.ts` (BookSchema, WorkSchema, new helper)
- Modify: `apps/server/src/sources/loc.ts:127-143` (`mergeTaggedTerms` dedupe key)
- Modify: `apps/server/src/services/bookService.ts:89`, `apps/server/src/services/workService.ts:55`
- Test: `apps/server/src/subjectTerms.test.ts` (new), `apps/server/src/sources/loc.test.ts`

**Interfaces:**
- Produces: `splitSubjectTerms(labels: string[]): { subjects: string[]; awards: string[] }` and `subjectKey(label: string): string`, both exported from `@book-explorer/shared`. Also `Book.awards: string[]` and `Work.awards: string[]`, declared as `z.array(z.string()).default([])`.

- [ ] **Step 1: Write the failing tests** in `apps/server/src/subjectTerms.test.ts`:

```ts
import { BookSchema, splitSubjectTerms, subjectKey } from "@book-explorer/shared";

it("drops NYT and other machine tags, keeps real subjects", () => {
  expect(splitSubjectTerms(["Science fiction", "nyt:mass-market-monthly=2021-11-07", "series:Dune", "Science fiction: history"]))
    .toEqual({ subjects: ["Science fiction", "Science fiction: history"], awards: [] });
});
it("turns award tags into readable awards, deduped", () => {
  expect(splitSubjectTerms(["Award:Hugo_Award=1966", "award:hugo_award=1966", "Award:Nebula_Award=Novel", "award:Locus_Award"]).awards)
    .toEqual(["Hugo Award (1966)", "Nebula Award (Novel)", "Locus Award"]);
});
it("keys near-duplicates together", () => {
  expect(subjectKey("Science-Fiction")).toBe(subjectKey("science fiction"));
  expect(subjectKey("Dune (Imaginary place), fiction")).toBe(subjectKey("Dune (Imaginary Place)"));
  expect(subjectKey("Fiction")).not.toBe("");
});
it("parses a cached Book that predates awards", () => {
  const bookWithoutAwards = { isbn: "1", title: "T", authors: [], subjects: [], genres: [], description: null, descriptionSource: null,
    descriptionSourceUrl: null, coverUrl: null, coverSource: null, openLibraryWorkId: null, openLibraryEditionId: null,
    wikidataId: null, format: null, rating: null, reviews: [] };
  expect(BookSchema.parse(bookWithoutAwards).awards).toEqual([]);
});
```

In `loc.test.ts`, add `mergeTaggedTerms merges "Science Fiction" (lcsh) and "science-fiction" (openLibrary) into one term with both sources`.

- [ ] **Step 2: Run** `cd apps/server && npx vitest run src/subjectTerms.test.ts src/sources/loc.test.ts`. Expected: FAIL, because `splitSubjectTerms` is not exported.

- [ ] **Step 3: Implement in `packages/shared/src/index.ts`**
  - A machine tag is any label matching `/^[a-z_]+:\S/i`. The space after the colon in "Science fiction: history" is what saves that one.
  - An `award:` tag becomes an award. The name is the part before `=`, with `_` replaced by spaces. If there is a qualifier after `=`, it is appended as ` (Qualifier)` and keeps its own case. Awards are deduped case-insensitively, and the first spelling seen wins.
  - Every other machine tag is dropped.
  - `subjectKey` lowercases, turns `-` and `_` into spaces, collapses whitespace, and strips a trailing `/,\s*fiction$/`. If the result would be empty, it returns the plain lowercased label instead (so "Fiction" alone keeps a key).
  - Add `awards: z.array(z.string()).default([])` to `BookSchema` and `WorkSchema`.

- [ ] **Step 4: Wire it into the server.**
  - `mergeTaggedTerms` uses `subjectKey(label)` instead of `label.trim().toLowerCase()`.
  - In both services, compute `const olTerms = splitSubjectTerms(ol.subjects)`. Pass `olTerms.subjects` where `ol.subjects` was passed before, and set `awards: olTerms.awards` on the result.
  - LOC labels are not split: they are controlled headings and contain no machine tags.

- [ ] **Step 5: Run** `cd apps/server && npx tsc --noEmit && npx vitest run`. Expected: PASS. `bookService.test.ts` mocks `loc.js`, so it still passes.

- [ ] **Step 6: Commit** with the message `feat(server): drop machine subject tags, split awards, merge near-duplicate subjects`.

### Task 2: Book/work pages: no source badges, an Awards section, a cache bump (items 2 and 4)

**Files:**
- Delete: `apps/app/src/components/SourceBadge.tsx`
- Modify: `apps/app/app/book/[isbn].tsx` (lines 18, 178, 202), `apps/app/app/work/[id].tsx` (lines 16, 146, 168), `apps/app/app/subject/[slug].tsx` (lines 9, 89)
- Modify: `apps/app/src/queryCache.ts:6`
- Test: `apps/app/src/queryCache.test.ts`, which already uses `CACHE_SCHEMA_VERSION`

**Interfaces:**
- Consumes: `Book.awards` and `Work.awards` from Task 1.

- [ ] **Step 1:** Remove every `<SourceBadge …/>` usage and import, then delete the component. Chip text becomes plain `titleCase(label)`.
- [ ] **Step 2:** On the book and work pages, add an **"Awards"** section directly after Genres. It uses the same section, heading and chip styles as Genres. The chips are **not** pressable (`<View>` + `<Text>`), because awards have no subject page. Render `titleCase(award)`, and only when `awards.length > 0`.
- [ ] **Step 3:** Set `CACHE_SCHEMA_VERSION = 2`, so persisted queries holding pre-cleanup tags are dropped. Run `cd apps/app && npx tsc --noEmit && npx vitest run`. Expected: PASS.
- [ ] **Step 4: Verify by eye.** Run `npm run dev:server` and `npm run dev:app`, then open Dune (ISBN 9780441013593). There should be no "OL/LC/WD" letters and no `Nyt:` or `Award:` chips, and an Awards section should list "Hugo Award (1966)".
- [ ] **Step 5: Commit** with the message `feat(app): remove source badges, show awards section`.

### Task 3: Correct authors (§2.3: *House Corrino*, Atomic Habits)

**Files:**
- Modify: `apps/server/src/sources/openLibrary.ts:398-440` (`OpenLibraryAuthorWork`, `getAuthorWorks`)
- Modify: `apps/server/src/services/bookEnrichment.ts:97-110` (`fetchMoreByAuthor`)
- Modify: `apps/server/src/services/bookService.ts:23-41`
- Test: `apps/server/src/sources/openLibrarySearch.test.ts`, `apps/server/src/services/bookService.test.ts`

**Interfaces:**
- Produces: `OpenLibraryAuthorWork` gains `authors: AuthorRef[]`.

- [ ] **Step 1: Write the failing tests.**
  - `getAuthorWorks returns each work's own authors`: mock a search doc with `author_name: ["Brian Herbert", "Kevin J. Anderson"]` and `author_key: ["OL1A", "OL2A"]`, then expect `authors` to equal both refs.
  - `getBookDetail falls back to the work's authors when the edition lists none`: add `vi.mock("./workService.js", () => ({ getWorkDetail: vi.fn() }))` at the top of the file, then mock `lookupByIsbn` returning `authors: []` and `workId: "OL1W"`, and mock `./workService.js` `getWorkDetail` resolving `{ authors: [{ openLibraryId: "OL9A", name: "James Clear" }] }`. Expect `book.authors` to equal that ref.
- [ ] **Step 2: Run** `cd apps/server && npx vitest run src/sources/openLibrarySearch.test.ts src/services/bookService.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `getAuthorWorks` adds `author_name,author_key` to `fields` and zips them the same way `searchWorks` does.
  - `fetchMoreByAuthor` maps `authors: w.authors.length ? w.authors : [author]`, so it stops stamping the page's author onto every work.
  - In `getBookDetail`, after `lookupByIsbn`: `const authors = ol.authors.length || !ol.workId ? ol.authors : (await getWorkDetail(ol.workId).catch(optionalSource(entry, "work authors", null)))?.authors ?? [];`. Use `authors` everywhere `ol.authors` was used, including `firstAuthorName`. Calling `getWorkDetail` shares the work cache with the work page.
- [ ] **Step 4: Run** `npx tsc --noEmit && npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `fix(server): real co-authors in more-by-author, work-author fallback for editions with none`.

### Task 4: Search puts study guides and summaries last (§2.3)

**Files:**
- Modify: `apps/server/src/services/searchService.ts`
- Test: `apps/server/src/services/searchService.test.ts`

**Interfaces:**
- Produces: `isDerivativeTitle(title: string): boolean`, exported for tests.

- [ ] **Step 1: Write the failing tests.**
  - `isDerivativeTitle` is true for "Summary of Becoming by Michelle Obama", "Study Guide: Project Hail Mary", "Workbook for Atomic Habits", "Analysis of Dune" and "SparkNotes: Dune". It is false for "Becoming", "The Summary Murders" and "Dune".
  - `searchBooks keeps relevance order but moves derivative titles after real ones`: searchWorks resolves `[Summary of X, X, Study Guide: X, Y]`. Expect the titles in the order `[X, Y, Summary of X, Study Guide: X]`.
- [ ] **Step 2: Run** `npx vitest run src/services/searchService.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** using the regex `/^(summary|study guide|analysis|workbook|sparknotes|cliffsnotes|quicklet|conversations on)\b|\b(summary|study guide|workbook|analysis) (of|for|on)\b/i`, then a stable partition (real titles first, derivative titles after) inside the cached fetcher. Results are demoted, not dropped.
- [ ] **Step 4: Run** `npx tsc --noEmit && npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `fix(server): rank study guides and summaries below the real book`.

### Task 5: Sorting book lists on subject pages (item 5, §2.3, D2, D3)

**Files:**
- Modify: `apps/server/src/validation.ts:39,81` (`SEARCH_SORTS`, error message)
- Create: `apps/app/src/subjectSort.ts`, `apps/app/src/subjectSort.test.ts`
- Modify: `apps/app/app/subject/[slug].tsx`
- Test: `apps/server/src/validation.test.ts`

**Interfaces:**
- Consumes: the existing `searchBooks(params: Record<string, string>)` from `src/api/client.ts`, with the existing server `subject` and `sort` filters.
- Produces: `SUBJECT_SORTS: { value: SubjectSort; label: string }[]`, `type SubjectSort = "readinglog" | "rating" | "new" | "classic"`, `DEFAULT_SUBJECT_SORT: SubjectSort = "readinglog"`, and `subjectSortParams(subjectName: string, sort: SubjectSort): Record<string, string> | null` (null means "use the subject's own listing").

- [ ] **Step 1: Write the failing tests.**
  - Server: `parseSearchFilters accepts sort=rating and sort=readinglog` and still rejects `sort=bogus`.
  - App: `subjectSortParams("Science Fiction", "rating")` equals `{ subject: "Science Fiction", sort: "rating" }`, and `subjectSortParams("Science Fiction", "classic")` is `null`. `SUBJECT_SORTS` labels are exactly `["Most read", "Top rated", "Newest", "Classic"]`.
- [ ] **Step 2: Run** the tests in both workspaces. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `SEARCH_SORTS = ["relevance", "new", "old", "rating", "readinglog"]`, and the error message lists all five.
  - On the subject page, add a row of `Button variant="pill"` sort chips above "Books", with `active` on the current one (`useState(DEFAULT_SUBJECT_SORT)`).
  - When `subjectSortParams` is not null, a second `useQuery(["search", params], () => searchBooks(params))` supplies the FlatList data. Otherwise `data.books` does. Show an inline `ActivityIndicator` while it loads.
- [ ] **Step 4: Run** `npx tsc --noEmit && npx vitest run` in both workspaces. Expected: PASS. Then open `/subject/science_fiction` and check that "Most read" isn't led by Alice in Wonderland.
- [ ] **Step 5: Commit** with the message `feat: sort subject book lists by most read, top rated, newest`.

### Task 6: Edition order: English, then newest, with a cover boost (item 8)

**Files:**
- Create: `apps/server/src/editionOrder.ts`, `apps/server/src/editionOrder.test.ts`
- Modify: `apps/server/src/sources/openLibrary.ts:196-205` (replace the language-only sort)

**Interfaces:**
- Produces: `publishYear(date: string | null): number | null`, `COVER_BOOST_YEARS = 2`, and `orderEditions<T extends { nonEnglish: boolean; publishDate: string | null; coverUrl: string | null }>(editions: T[]): T[]`.

- [ ] **Step 1: Write the failing tests.**
  - `publishYear("March 3, 2019")` is 2019, `publishYear("1965")` is 1965, and `publishYear("n.d.")` and `publishYear(null)` are null.
  - `orderEditions`: every English edition comes before any non-English one. Within a language group, 2019 without a cover comes before 2010 with a cover, but 2018 with a cover comes before 2019 without one (the 2-year boost). An edition with no year sorts after dated ones. Ties keep their input order.
- [ ] **Step 2: Run** `npx vitest run src/editionOrder.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `publishYear` takes the last 4-digit match of `/\b(1[5-9]\d\d|20\d\d)\b/g`. The score is `(year ?? -Infinity) + (coverUrl ? COVER_BOOST_YEARS : 0)`, and the sort is stable by `[nonEnglish asc, score desc]`. In `openLibrary.ts`, replace `ordered` with `orderEditions(editions)` and update the comment above it.
- [ ] **Step 4: Run** `npx tsc --noEmit && npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(server): order editions by English, then newest, cover as a small boost`.

### Task 7: "Recently looked at" shows title and author (item 9, §2.4)

**Files:**
- Modify: `apps/app/src/storage/history.ts`, `apps/app/src/storage/history.test.ts`
- Modify: `apps/app/app/book/[isbn].tsx:55`, `apps/app/app/index.tsx`

**Interfaces:**
- Produces: `interface RecentBook { isbn: string; title: string | null; authorNames: string[] }`, `getRecentBooks(): Promise<RecentBook[]>` and `addRecentBook(book: RecentBook): Promise<void>`. These replace `getRecentIsbns` and `addRecentIsbn`. The storage key and the 20-entry cap stay the same.

- [ ] **Step 1: Write the failing tests.** Rewrite the existing three tests for the new API, then add:
  - `reads a legacy string[] history as untitled entries`: set the key to `'["123"]'`, then expect `[{ isbn: "123", title: null, authorNames: [] }]`.
  - `re-adding an ISBN replaces its old entry with the new title`.
- [ ] **Step 2: Run** `cd apps/app && npx vitest run src/storage/history.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Each stored entry is either a string or a `RecentBook`, and is normalized on read. Dedupe by `isbn`. The book page calls `addRecentBook({ isbn: data.isbn, title: data.title, authorNames: data.authors.map((a) => a.name) })`.
- [ ] **Step 4: Update the home screen.** Each row shows the title in the display font (falling back to the ISBN) and, when present, a second muted line with the author names joined by ", ". The accessibility label is `"<title>, <authors>"`, or the ISBN alone. Then run `npx tsc --noEmit && npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(app): recently looked at shows title and author`.

### Task 8: Footer scrolls with content; header actions stop cutting off titles (item 7, §2.9)

**Files:**
- Modify: `apps/app/app/_layout.tsx:126` (remove `<Footer />`)
- Modify: `apps/app/src/components/Footer.tsx` (smaller: `paddingVertical: 8`, logo `96×19`, `marginBottom: 4`)
- Modify: the scrollable screens `app/index.tsx`, `book/[isbn].tsx`, `author/[id].tsx`, `subject/[slug].tsx`, `work/[id].tsx`, `search.tsx`, `connection.tsx` and `saved.tsx`. The screens that Tasks 9 and 11 create add `<Footer />` themselves.
- Modify: `apps/app/src/components/HeaderActions.tsx`, `MyLibraryButton.tsx`, `NewSearchButton.tsx`

**Interfaces:**
- Produces: `MyLibraryButton({ iconOnly }: { iconOnly?: boolean })` and `NewSearchButton({ iconOnly }: { iconOnly?: boolean })`. `HeaderActions` renders both with `iconOnly`.

- [ ] **Step 1:** Render `<Footer />` as the last child of each ScrollView, or as `ListFooterComponent` of each FlatList. For index, use the recents FlatList's `ListFooterComponent`, or the end of the screen when there are no recents. The graph and scan screens get no footer, because they are full-screen tools.
- [ ] **Step 2:** In icon-only mode, the buttons use lucide `Library` and `Search` icons at size 20 inside a 44×44 `Pressable`, with `accessibilityRole="button"` and `accessibilityLabel` "My Library" or "New search". The home screen keeps the text "My Library" pill, because it has room for it.
- [ ] **Step 3: Run** `npx tsc --noEmit`. Expected: PASS. **Verify by eye** at 390×844: the graph header reads "Explore Graph" in full, "Find Connection" is untruncated, and the footer appears only at the bottom of a scrolled page.
- [ ] **Step 4: Commit** with the message `feat(app): footer scrolls with content, icon header actions`.

### Task 9: Split My Library into Library, Recommendations and Settings; plain-language library setup (item 1, §2.6, §2.7)

**Files:**
- Create: `apps/app/app/recommendations.tsx`, `apps/app/app/settings.tsx`
- Modify: `apps/app/app/saved.tsx` (move out `RecommendationsSection`, `AppearanceSection`, Libraries and `BackupSection`)
- Modify: `apps/app/src/navigation.ts`, `apps/app/app/_layout.tsx` (Stack screens)

**Interfaces:**
- Produces: `routes.recommendations(): Href` ("/recommendations") and `routes.settings(): Href` ("/settings"). The "Lists" row and `routes.lists()` are added in Task 11, because typed routes reject a path that has no screen yet.

- [ ] **Step 1:** `recommendations.tsx` renders `<RecommendationsSection refreshKey={items} />` in a ScrollView, reloading `getSavedItems` on focus the same way `saved.tsx` does. `settings.tsx` gets `AppearanceSection`, `LibraryCard`, the Libraries section and `BackupSection`, moved verbatim with their styles. My Library keeps only Saved Books and Saved Authors. Both new screens end with `<Footer />`.
- [ ] **Step 2:** At the top of My Library, add two navigation rows styled like the `recentItem` rows (ChevronRight, `accessibilityRole="button"`): **Recommendations** and **Settings & backup**. Stack titles are "Recommendations" and "Settings".
- [ ] **Step 3: Rewrite the library-setup help** in `settings.tsx`. Keep the existing behaviour and change only the copy:
  - Section intro: "Add your library so book pages can link to its catalog."
  - ISBN field help: "1. Open your library's online catalog. 2. Search for any book's ISBN. 3. Copy the address of the results page and paste it here."
  - Title field help: the same three steps with "title" in place of "ISBN".
  - Keep one line about `{isbn}`/`{title}` placeholders, under a smaller "Advanced:" prefix.
- [ ] **Step 4: Run** `npx tsc --noEmit && npx vitest run`. Expected: PASS. **Verify by eye** that Export CSV is two taps from My Library (Settings → Export CSV).
- [ ] **Step 5: Commit** with the message `feat(app): split My Library into library, recommendations and settings pages`.

### Task 10: Named lists: storage, backup and merge (item 6, §2.6)

**Files:**
- Create: `apps/app/src/storage/savedLists.ts`, `apps/app/src/storage/savedLists.test.ts`
- Modify: `packages/shared/src/index.ts` (`SavedListExportSchema`, `SnapshotExportSchema`)
- Modify: `apps/app/src/storage/schema.ts` (`SCHEMA_VERSION = 3`, with a comment line "3: named lists (savedLists.ts)")
- Modify: `apps/app/src/storage/snapshot.ts`, `apps/app/src/storage/mergeSnapshot.ts`
- Test: `snapshot.test.ts`, `mergeSnapshot.test.ts`, `apps/app/src/backup.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface ListMember { type: "book" | "work" | "author"; id: string; title: string; addedAt: number }
  interface SavedList extends Versioned { id: string; name: string; description: string; kind: "book" | "author"; members: ListMember[]; createdAt: number; deletedAt?: number }
  getLists(kind?: SavedList["kind"]): Promise<SavedList[]>        // live only, newest first
  getAllLists(): Promise<SavedList[]>                               // tombstones included, for the snapshot
  getList(id: string): Promise<SavedList | null>
  createList(input: { name: string; description?: string; kind: SavedList["kind"] }): Promise<SavedList>
  addToList(listId: string, member: Omit<ListMember, "addedAt">): Promise<void>      // idempotent
  removeFromList(listId: string, type: ListMember["type"], id: string): Promise<void>
  deleteList(id: string): Promise<void>                             // tombstone, members blanked
  replaceLists(lists: SavedList[]): Promise<void>
  ```
  `Snapshot` gains `lists: SavedList[]`.

- [ ] **Step 1: Write the failing tests** in `savedLists.test.ts`, using the existing `src/test/asyncStorageMock.ts`:
  - `createList trims the name and rejects an empty one` (throws).
  - `getLists("book") excludes author lists and deleted lists`.
  - `addToList twice keeps one member`.
  - `addToList refuses a member whose kind doesn't match the list`: an author on a book list throws, and so does a book on an author list.
  - `deleteList tombstones and blanks members`.
  - `concurrent addToList calls both land` (Promise.all, the same pattern as history.test.ts).

  In `mergeSnapshot.test.ts`: `lists merge by id, newer wins, tombstone beats an older edit`.
  In `backup.test.ts`: `a schemaVersion 2 backup with no lists imports with lists: []`, and `a schemaVersion 3 backup without lists is rejected`.
- [ ] **Step 2: Run** `npx vitest run src/storage src/backup.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The storage key is `"book-explorer:saved-lists"`. Every write goes through `enqueueWrite`.
  - `id` is `` `list-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` ``.
  - Name is at most 100 characters and description at most 1,000.
  - Export schema: `name: z.string().min(1).max(100)`, `description: text`, `kind: z.enum(["book", "author"])`, `members: z.array(...).max(MAX_IMPORT_RECORDS)`. Each member is `{ type, id: z.string().min(1).max(200), title: text, addedAt }`.
  - `SnapshotExportSchema`: `lists` is optional, refined as required from schemaVersion 3, and transformed to default `[]`, the same way `works` is.
  - `mergeSnapshots` adds `lists: sorted(mergeBy(a.lists, b.lists, (l) => l.id, newer))`.
  - `getSnapshot` and `applySnapshot` include lists.
  - `migrateStorage` needs no data change for v3. The version bump alone is enough.
- [ ] **Step 4: Run** `npx tsc --noEmit && npx vitest run` in `apps/app` and `apps/server`, since server tests import shared. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(app): named lists storage, backup and merge`.

### Task 11: Named lists: screens and "Add to list" (item 6)

**Files:**
- Create: `apps/app/app/lists/index.tsx`, `apps/app/app/lists/[id].tsx`, `apps/app/src/components/AddToListButton.tsx`
- Modify: `apps/app/src/navigation.ts` (add `routes.lists()` and `routes.list(id)`), `apps/app/app/_layout.tsx`, `apps/app/app/saved.tsx` (add a **Lists** row above the Task 9 rows). Both new screens end with `<Footer />`.
- Modify: `apps/app/app/book/[isbn].tsx`, `work/[id].tsx`, `author/[id].tsx` (next to their Save/Share buttons)

**Interfaces:**
- Consumes: the Task 10 API.
- Produces: `routes.lists(): Href` ("/lists"), `routes.list(id: string): Href` (`{ pathname: "/lists/[id]", params: { id } }`) and `AddToListButton({ member }: { member: Omit<ListMember, "addedAt"> })`. The kind is derived from the member: author → "author", anything else → "book".

- [ ] **Step 1: AddToListButton.** A `Button variant="pill"` labelled "Add to list" opens a React Native `Modal` (transparent, slide). The modal contains:
  - A "Choose a list" heading.
  - One row per `getLists(kind)` list, with `accessibilityRole="checkbox"` and `accessibilityState={{ checked }}`. Tapping a row toggles it with `addToList`/`removeFromList`.
  - A **"Create new list"** row that reveals Name (required) and Description (optional) inputs, plus a "Create and add" primary button. That button calls `createList`, then `addToList`, and the new list shows as checked.
  - A "Done" button.

  If `createList` throws, show the error inline with `accessibilityLiveRegion="polite"`.
- [ ] **Step 2: Lists screen** (`/lists`). It has two sections, "Book lists" and "Author lists", with the existing empty-state copy style ("No book lists yet. Tap “Add to list” on a book page to start one."), plus a "New list" button that reuses the create form. Each row shows the name, the member count and a ChevronRight, and opens `routes.list(id)`.
- [ ] **Step 3: List detail screen** (`/lists/[id]`). It shows the name as a header, then the description, then the members. A member row opens `routes.book`, `routes.work` or `routes.author` according to its type, and has a "Remove" pill. A "Delete list" danger pill asks for confirmation (web `confirm`, native `Alert.alert`) before calling `deleteList`, then goes back.
- [ ] **Step 4: Run** `npx tsc --noEmit && npx vitest run`. Expected: PASS. **Verify by eye:** create "Book club" from Dune's page, add Atomic Habits to it, check that it shows on `/lists` and that an author can't be added to it (author pages only list author lists).
- [ ] **Step 5: Commit** with the message `feat(app): lists pages and add-to-list sheet`.

### Task 12: CSV export: shelves from lists, not subjects (§2.8, confirmed bug)

**Files:**
- Modify: `apps/app/src/csv.ts:39-63`, `apps/app/src/backup.ts:28`, `apps/app/src/components/BackupSection.tsx:111` (help text)
- Test: `apps/app/src/csv.test.ts`

**Interfaces:**
- Consumes: `SavedList` from Task 10.
- Produces: `booksToCsv(books: SavedBookRecord[], lists: SavedList[]): string`. Header: `["Title", "Author", "Additional Authors", "ISBN", "ISBN13", "Bookshelves", "Exclusive Shelf", "Private Notes", "Date Added"]`.

- [ ] **Step 1: Write the failing tests.**
  - `Bookshelves holds the book's live book-list names as Goodreads shelf slugs, never subjects`: a record with subjects `["Award:Hugo_Award=1966"]` that is in list "Book Club 2026" exports `Bookshelves = "book-club-2026"` and `Exclusive Shelf = "to-read"`.
  - `a book in no list exports an empty Bookshelves`.
  - `a list named "=HYPERLINK(x)" is neutralised`: the field starts with `'`.
  - The existing round-trip test still reads back through `readBookCsv`.
- [ ] **Step 2: Run** `npx vitest run src/csv.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - A shelf slug is the name lowercased, with each run of non-alphanumeric characters replaced by `-` and leading/trailing `-` trimmed.
  - Membership means a live `kind: "book"` list with a member `{ type: "book", id: isbn }`.
  - `backup.ts` passes `snapshot.lists`.
  - New help text: "CSV export works with Goodreads and StoryGraph. It includes title, author, ISBN, your notes, date added, and your list names as shelves. Every book is marked “to-read”. Subjects and genres are only kept in the JSON backup."
- [ ] **Step 4: Run** `npx tsc --noEmit && npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `fix(app): CSV export uses list names as shelves, not subjects`.

### Task 13: Explain the graph and Find Connection (§2.5)

**Files:**
- Modify: `apps/app/app/graph/[type]/[id].tsx` (lines 374-390 for the hint and legend; lines 532, 581 and 594 for label font sizes)
- Modify: `apps/app/app/connection.tsx:79-90`
- Modify: `apps/app/src/graphLabels.ts`, `apps/app/src/graphLabels.test.ts`

**Interfaces:**
- Produces: `legendEntries(nodes: GraphNode[]): { types: GraphNode["type"][]; showUnlinked: boolean }`, in `graphLabels.ts`. It returns the node types present, in `NODE_COLORS` key order, and whether any node has `navigable: false`.

- [ ] **Step 1: Write the failing test.** `legendEntries` for nodes `[author, work, subject(navigable: false)]` returns `{ types: ["author", "work", "subject"], showUnlinked: true }`, and for nodes with no genre and all navigable it returns no "genre" and `showUnlinked: false`.
- [ ] **Step 2: Run** `npx vitest run src/graphLabels.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The legend renders only `legendEntries(graph.nodes)`. The faded swatch gets `borderWidth: 1, borderColor: colors.inkFaint` with opacity raised to 0.6.
  - The visible hint becomes: "Each circle is a book, author or subject. Tap one to move there; tap the center circle to open its page." The screen-reader instruction moves to the graph container's `accessibilityHint`.
  - Node label `fontSize` goes from 9.5 to 12 and from 11 to 13. Then check that `graphLayout.test.ts` still passes. If the layout uses label width, adjust its constant in the same commit.
- [ ] **Step 4: Update Find Connection.** Under the "Connect {label} to…" heading, add muted text at `typeScale.sm`: "Pick a second book and we'll show how the two are linked: through shared authors, subjects, series or influences." On the book page, the Find Connection button gets `accessibilityHint="Shows how this book links to another book you pick"`.
- [ ] **Step 5: Run** `npx tsc --noEmit && npx vitest run`. Expected: PASS.
- [ ] **Step 6: Commit** with the message `feat(app): explain graph and Find Connection, legend shows only present types`.

### Task 14: Contrast and control-state fixes in both themes (§3, §2.10)

**Files:**
- Modify: `apps/app/src/theme.ts` (tokens and `typeScale.xs`)
- Modify: `apps/app/src/components/Button.tsx:37-85`, `apps/app/app/index.tsx` (scan button), `apps/app/app/settings.tsx` and `saved.tsx` (Remove pills), the chip styles in `book/[isbn].tsx` and `work/[id].tsx`
- Create: `apps/app/src/components/CoverPlaceholder.tsx`. Modify: `apps/app/src/components/WorkListRow.tsx:37`
- Create: `apps/app/src/theme.test.ts`

**Interfaces:**
- Produces: a new token `pillBorder` in `ThemeColors`, `primary`/`primaryText` repurposed as the primary-button colours (both are currently unused), and `CoverPlaceholder({ width, height }: { width: number; height: number })`.

- [ ] **Step 1: Write the failing test** `theme.test.ts`, with a local `contrast(a, b)` helper using the WCAG relative-luminance formula. For **each** theme it asserts:
  - `primaryText` on `primary` ≥ 4.5
  - `primary` vs `paper` ≥ 3
  - `pillBorder` vs `paper` ≥ 3
  - `pillBorder` vs `chipBackground` ≥ 3
  - `inkFaint` on `paper` ≥ 5.5
  - `danger` on `paper` ≥ 4.5
  - `chipTextSubject` on `chipBackgroundSubject` ≥ 4.5

  It also asserts `typeScale.xs >= 14`.
- [ ] **Step 2: Run** `npx vitest run src/theme.test.ts`. Expected: FAIL.
- [ ] **Step 3: Set the values.** Each one was checked against its pair.
  - Light: `primary: "#2B5951"`, `primaryText: "#FFFFFF"`, `pillBorder: "#8C877B"` (3.35:1 on paper, 3.2:1 on chip), `inkFaint: "#5C5B66"` (6.24:1).
  - Dark: `primary: "#3A7F70"`, `primaryText: "#FFFFFF"` (4.72:1, and 3.65:1 vs paper), `pillBorder: "#6B6B7B"` (3.29:1).
  - `typeScale.xs: 14`.
- [ ] **Step 4: Apply them to the components.**
  - `Button` primary uses `primary`/`primaryText`, and so does the home scan button.
  - `pill` gets `borderWidth: 1, borderColor: colors.pillBorder`.
  - `pillActive` becomes `{ backgroundColor: colors.primary, borderColor: colors.primary }` with `primaryText` text and star. This fixes both the faint Appearance selection and "★ Saved" not feeling confirmed, and it takes rust off "Saved", so rust only means "subject".
  - The Remove pills get `borderWidth: 1, borderColor: colors.danger`.
  - Subject and genre chips get `borderWidth: 1` in their own text colour.
- [ ] **Step 5: Add `CoverPlaceholder`.** It is a `View` with a 1px `pillBorder` border on `chipBackground` and a centered lucide `BookOpen` icon (size 18, `inkFaint`), marked `accessibilityElementsHidden`. Use it in `WorkListRow`.
- [ ] **Step 6: Run** `npx tsc --noEmit && npx vitest run`. Expected: PASS. **Verify by eye** in light and dark: the secondary pills read as buttons, the selected Appearance option is obvious, placeholders read as "no cover", and the dark-mode primary buttons have white text.
- [ ] **Step 7: Commit** with the message `feat(app): contrast and control-state fixes for light and dark themes`.

### Task 15: Apply the app name (only if D1 picks a new name)

**Files:** `apps/app/app/index.tsx:32` (heading), `apps/app/app/_layout.tsx` (`index` Stack title), `apps/app/app.json` (`expo.name`), `README.md` (title line). Leave `slug`, `scheme` and the storage keys alone, because changing them would orphan installed data and deep links.

- [ ] **Step 1:** Replace the visible "Book Explorer" in those four places. Keep the "find your next read" tagline.
- [ ] **Step 2:** Run `grep -rn "Book Explorer" apps/app/app apps/app/src`. Expected: no user-visible matches.
- [ ] **Step 3: Commit** with the message `chore: rename app to <name>`.

---

## Not in this plan (raised, deliberately deferred)

- Reading status and star ratings (Opus P5, Copilot P5). Named lists cover "to-read" style use for now.
- Missing co-authors when the edition lists *some* authors (Saga, Fiona Staples), and volume/series info on comics.
- Unrelated results deeper in search (the Shakespeare plays below Project Hail Mary).
- Missing plot descriptions on some book pages, and reviews being collapsed.
- Home-screen whitespace (Copilot light, 4 of 6). Recents with titles (Task 7) fill some of it.
- Cleaning machine tags out of books **already saved** before Task 1. Their records keep the old tags until the user edits them.
