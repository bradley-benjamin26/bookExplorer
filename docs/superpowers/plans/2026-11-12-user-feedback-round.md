# User Feedback Round (covers, accounts, unlink, identifiers, skip links, Hardcover 5xx) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix ten items from the user's 2026-11-12 feedback: Hardcover 5xx handling, covers on list pages, accounts back at the top of My Library, explicit Unlink labels, subject identifiers, keyboard skip links over long lists, a matching "Find connection" button, linked notable works on author pages, and new award pages that every award label and graph node links to, and an aligned graph toolbar.

**Architecture:** Small, mostly independent edits. Pure logic goes in `apps/app/src/*.ts` (or `apps/server/src`) with vitest tests; screens only wire it in. Skip links and the subject identifier list are the only new UI pieces.

**Tech Stack:** Expo 57 / React Native Web / expo-router, Fastify server, zod schemas in `packages/shared`, vitest. Read https://docs.expo.dev/versions/v57.0.0/ before touching Expo APIs (apps/app/AGENTS.md).

**Spec:** none. Requirements are the user's messages of 2026-11-12 (quoted per task). Main was fetched: `main` equals `origin/main` (checked, no pull needed). Work on a branch off main (`git switch -c feedback-round`), not on main.

## Global Constraints

- Run tests with `npm test` inside `apps/app` or `apps/server`; typecheck with `npm run typecheck` at the repo root.
- Unit tests ship with each feature (project preference). Write the failing test first.
- Sentence case for headings and buttons, except the service names the user specified: `Unlink Hardcover`, `Unlink Open Library`.
- Skip links, covers and identifiers must work for keyboard and screen-reader users (accessibility is a core requirement here: decorative images keep `alt=""`/hidden, links have real labels).
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Assumptions to confirm (the plan proceeds on these)

1. "Settings page … account options on top" means the **My Library** screen (`apps/app/app/saved.tsx`). It is the only screen with account options, and commit 4d19151 moved them under the lists. `settings.tsx` has no account section.
2. "Find connection same as View as graph, as before" means the primary rust button, as before commit 0c210cc, on the work, book and author pages.
3. "Covers on lists" means the list detail page (`lists/[id].tsx`), whose rows are text only. The My Library and All lists pages already show a cover stack.

3b. Award pages: Open Library tags only name an award (no id), so winners and the description come from Wikidata; an unmatched award still gets a page. The award page and the graph share one slug (`awardSlug`), which is the slug graph nodes already use.

4. The Filter/Share fix is for the graph screen toolbar (the only place they sit next to the Graph/List buttons). If you meant the Share button on detail pages too, say so.

## Review Focus

- A Hardcover 5xx or timeout on a decorative call (reading progress) must never show an error or retry in a loop: the page renders as if there were no progress.
- A list member with no cover (work with no cover, author, offline) shows a placeholder, never a broken image icon.
- A subject with no Wikidata or LCSH id (both `null`) shows only the Open Library identifier, and no empty "Identifiers" rows.
- Old persisted subject cache entries without the new field still parse (the app persists its query cache).
- Skip links are invisible until focused, exist only on web, and the target receives focus so the next Tab lands after the list; a list with a single item or none shows no skip link.

## File Structure

- Modify `apps/server/src/sources/hardcover.ts`, `apps/server/src/routes/hardcover.ts`, `apps/server/src/sources/hardcover.test.ts`: 5xx becomes a typed 503.
- Modify `apps/app/src/components/HardcoverProgress.tsx`: no retries.
- Modify `apps/app/src/listCovers.ts` (+test), `apps/app/app/lists/[id].tsx`: member covers.
- Create `apps/app/src/listServiceLabels.ts` (+test); modify `apps/app/app/lists/[id].tsx`.
- Modify `apps/app/app/saved.tsx`, `apps/app/src/libraryRows.ts` only if needed; test in `apps/app/src/libraryRows.test.ts`.
- Modify `packages/shared/src/index.ts`, `apps/server/src/services/subjectService.ts` (+test), create `apps/app/src/subjectIdentifiers.ts` (+test), modify `apps/app/app/subject/[slug].tsx`.
- Create `apps/app/src/skipLink.ts` (+test), `apps/app/src/components/SkipLink.tsx`; modify the list-bearing screens/sections listed in Task 6.
- Modify `apps/app/app/work/[id].tsx`, `apps/app/app/book/[isbn].tsx`, `apps/app/app/author/[id].tsx`.
- Tasks 8-12 add `relationHref`, the award service/route/page and `routes.award`; their file lists are in the tasks.
- Modify `docs/CODEBASE.md` in the last task.

---

### Task 1: Hardcover 5xx becomes a 503, and progress never retries

User: "I'm getting 500 errors from Hardcover (the status code is 500 the message is 503)" on `GET /api/hardcover/progress/book|work/...`.

Cause: `hardcoverGraphql` throws a plain `Error("Hardcover request failed: 503")` for any non-OK status. Nothing maps it, so Fastify answers 500, and react-query retries the failing `useQuery` three times (the four identical requests in the console).

**Files:**
- Modify: `apps/server/src/sources/hardcover.ts:58` (and add the error class beside `HardcoverRateLimitError`)
- Modify: `apps/server/src/routes/hardcover.ts:50-60` (error handler)
- Modify: `apps/app/src/components/HardcoverProgress.tsx` (`useQuery` options)
- Test: `apps/server/src/sources/hardcover.test.ts`, `apps/server/src/routes/hardcover.test.ts`

**Interfaces:**
- Produces: `export class HardcoverUnavailableError extends Error { constructor(public status: number) }` in `sources/hardcover.ts`. The route handler turns it into `503 { error: "Hardcover is temporarily unavailable. Try again in a minute." }`.

- [ ] **Step 1: Write failing tests.** In `hardcover.test.ts`, mirroring the existing 429 test at line 76: `it("throws HardcoverUnavailableError for a 503 and a 500")` mocks `fetchWithTimeout` to return `new Response("", { status: 503 })` (then 500) and expects `hardcoverGraphql(...)` to reject with `HardcoverUnavailableError` whose `status` is 503 (then 500). In `routes/hardcover.test.ts`, mirroring an existing route test: `it("answers 503, not 500, when Hardcover is down")` mocks `readingProgress` to reject with `new HardcoverUnavailableError(503)` and expects `res.statusCode === 503` and the body error text above.
- [ ] **Step 2: Run** `npm test -- hardcover` in `apps/server`. Expected: both new tests FAIL (class not exported / status 500).
- [ ] **Step 3: Implement.** In `hardcoverGraphql`, replace `if (!res.ok) throw new Error(...)` with: `if (res.status >= 500) throw new HardcoverUnavailableError(res.status);` before the generic `!res.ok` throw (keep the generic one for other 4xx). In the route error handler add a branch before the `upstreamErrorHandler` fallthrough returning the 503 body.
- [ ] **Step 4: Client.** Add `retry: false` to the `useQuery` options in `HardcoverProgress.tsx` (progress is decorative, `data` stays undefined on error and the component already renders nothing).
- [ ] **Step 5: Run** `npm test` in `apps/server` and `apps/app`. Expected: PASS.
- [ ] **Step 6: Commit** `fix(server): Hardcover 5xx answers 503; progress badge doesn't retry`.

### Task 2: Covers on list detail rows

User: "Were book covers added to display on lists? It doesn't look like it. please add it."

Findings: `ListMember` stores only `type`, `id`, `title` (no cover). Books have an ISBN as `id`, so a cover URL is derivable. Works (OL work id) and authors (OL author id) can use Open Library's olid cover endpoints.

**Files:**
- Modify: `apps/app/src/listCovers.ts`
- Modify: `apps/app/app/lists/[id].tsx:~215-235` (member rows)
- Test: `apps/app/src/listCovers.test.ts`

**Interfaces:**
- Produces: `memberCoverUrl(m: ListMember): string | null` returning `isbnCoverUrl(m.id)` for `book`, `https://covers.openlibrary.org/w/olid/${m.id}-S.jpg` for `work`, `https://covers.openlibrary.org/a/olid/${m.id}-S.jpg` for `author`. `listCoverUrls` is rewritten to `members.slice(0, max).map(memberCoverUrl)` so the stacks gain work and author covers too.

- [ ] **Step 1: Verify the endpoints.** Run `curl -sI "https://covers.openlibrary.org/w/olid/OL1095427W-S.jpg?default=false" | head -1` and the same with `a/olid/OL...A`. Expected: 200 (or a redirect to 200). If `w/olid` fails, fall back to `null` for works and say so in the commit.
- [ ] **Step 2: Failing tests** in `listCovers.test.ts`: `memberCoverUrl` for each of the three member types gives the exact URLs above; the existing `listCoverUrls` test (line 12) is updated so a work member now yields its URL, not `null`.
- [ ] **Step 3: Run** `npm test -- listCovers` in `apps/app`. Expected: FAIL.
- [ ] **Step 4: Implement** `memberCoverUrl`, rewrite `listCoverUrls`.
- [ ] **Step 5: Row UI.** In the `list.members.map` row (inside `rowMain`), put before the title: an `Image` (44x64, `radii.xs`, `resizeMode="contain"`, `alt=""`, since the row label already names the book) when `memberCoverUrl` is non-null, else `<CoverPlaceholder width={44} height={64} />`. Track `onError` per row in a small `useState<Set<string>>` so a missing cover swaps to the placeholder (Open Library returns a 1x1 or 404 for unknown covers, so also pass `?default=false` to the URL used in the row so errors fire). Row text stays the accessible name.
- [ ] **Step 6: Run** `npm test` and `npm run typecheck` (root). Expected: PASS. Then open a list in the running web app and confirm covers, placeholder and a dead URL (devtools offline) all render.
- [ ] **Step 7: Commit** `feat(app): covers on list rows`.

### Task 3: Unlink buttons name the service

User: "The 'unlink' buttons are not updated with the clarification ie (Unlink Hardcover and Unlink Open Library)."

**Files:**
- Create: `apps/app/src/listServiceLabels.ts`, `apps/app/src/listServiceLabels.test.ts`
- Modify: `apps/app/app/lists/[id].tsx:157-163` (`syncButtons`)

**Interfaces:**
- Produces: `listServiceLabels(service: "Hardcover" | "Open Library"): { sync: string; unlink: string; copy: string }` returning `Sync with X`, `Unlink X`, `Copy to X`.

- [ ] **Step 1: Failing test:** `expect(listServiceLabels("Open Library").unlink).toBe("Unlink Open Library")` and the same for Hardcover, `sync` and `copy`.
- [ ] **Step 2: Run** `npm test -- listServiceLabels`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the function; in `syncButtons` use it for the three button texts and set the unlink `accessibilityLabel` to the same `unlink` string (replacing `Unlink from X`). The confirm dialog title `Unlink from X?` stays.
- [ ] **Step 4: Run** `npm test` and typecheck. Expected: PASS.
- [ ] **Step 5: Commit** `fix(app): Unlink buttons say which service`.

### Task 4: Accounts back on top of My Library

User: "The settings page was reordered. Put the account options on the top of settings again." (assumption 1.)

**Files:**
- Modify: `apps/app/app/saved.tsx:70-130` (render order)
- Test: `apps/app/src/libraryRows.test.ts`

Today's order: Your lists, See all lists, discovery rows, "Accounts" heading with `ACCOUNT_ROWS`, tools. Target order: accounts (`ACCOUNT_ROWS`), then Your lists, See all lists, discovery, tools.

- [ ] **Step 1: Read** the rest of `saved.tsx` (lines 105-end) to see how the "Accounts" block is rendered and which headings exist.
- [ ] **Step 2: Reorder** so `ACCOUNT_ROWS.map(navRow)` (with its existing heading, moved above "Your lists") renders first. No data changes. `libraryRows.test.ts` already pins group membership; add `it("lists accounts before discovery in the combined order")` asserting `[...ACCOUNT_ROWS, ...DISCOVERY_ROWS].map(r => r.id)` equals `["hardcover","openlibrary","recommendations","connection"]` so the intended order is tested.
- [ ] **Step 3: Run** `npm test -- libraryRows`; then look at the screen in the browser. Expected: accounts on top, no duplicate headings.
- [ ] **Step 4: Commit** `fix(app): accounts lead My Library again`.

### Task 5: Subject identifiers

User: "Can you list identifiers for subjects, so I can know where they are coming from?"

Sources already known per subject: the Open Library subject slug, the LCSH heading URI (`canonical.uri` / `lcshUri` in `subjectService.ts`), and the Wikidata Q-id (`wikidataId`, already in `SubjectSchema`). The LCSH URI is not returned today.

**Files:**
- Modify: `packages/shared/src/index.ts:212` (`SubjectSchema`), `apps/server/src/services/subjectService.ts` (`toSubject` and its caller)
- Create: `apps/app/src/subjectIdentifiers.ts`, `apps/app/src/subjectIdentifiers.test.ts`
- Modify: `apps/app/app/subject/[slug].tsx` (new section after the description)
- Test: `apps/server/src/services/subjectService.test.ts`

**Interfaces:**
- Produces: `SubjectSchema` gains `lcshUri: z.string().nullable().default(null)` (the default keeps old persisted cache entries parsing).
- Produces: `subjectIdentifiers(s: Pick<Subject, "slug" | "wikidataId" | "lcshUri">): { source: string; id: string; url: string }[]`, in the order Open Library (`s.slug`, `https://openlibrary.org/subjects/${slug}`), Library of Congress (the URI's last path segment, e.g. `sh85101653`, linking to the URI), Wikidata (`Q…`, `https://www.wikidata.org/wiki/${Q}`). Null sources are omitted.

- [ ] **Step 1: Failing tests.** `subjectIdentifiers.test.ts`: all three present gives three rows with the exact ids and urls; both nulls gives only Open Library; a `lcshUri` of `http://id.loc.gov/authorities/subjects/sh85101653` gives id `sh85101653`. `subjectService.test.ts`: the detail returned for a subject whose canonical heading has uri `…/sh85101653` has `lcshUri` equal to that uri, and `null` when there is none. Schema test (shared or app): `SubjectSchema.parse` of an object without `lcshUri` succeeds with `lcshUri: null`.
- [ ] **Step 2: Run** the three test files. Expected: FAIL.
- [ ] **Step 3: Implement** the schema field, pass `lcshUri` (already computed at `subjectService.ts:~122`) into `toSubject`, and write `subjectIdentifiers`.
- [ ] **Step 4: UI.** In the subject screen add an "Identifiers" `accessibilityRole="header"` section listing each row as `Source: id`, where the id is a link (`Linking.openURL`, accessibilityRole `link`, label `Source identifier id`), plus one helper line: "Where this subject's data comes from." Reuse the existing section title style.
- [ ] **Step 5: Run** `npm test` in server and app, and `npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Commit** `feat: list a subject's Open Library, LCSH and Wikidata identifiers`.

### Task 6: Skip links over long lists

User: "The skip links I asked for on pages were not incorporated to enable keyboard users to skip edition lists and other lists of books." No skip link exists anywhere in `apps/app` today (grep confirmed).

Design: a link, shown only when keyboard-focused, placed before a list; activating it moves focus to an invisible target after the list. Web only, since native users have no tab order to skip.

**Files:**
- Create: `apps/app/src/skipLink.ts`, `apps/app/src/skipLink.test.ts`, `apps/app/src/components/SkipLink.tsx`
- Modify: `apps/app/src/components/EditionsSection.tsx`, `apps/app/src/components/WorkListSections.tsx`, `apps/app/src/components/RecommendationsSection.tsx`, `apps/app/app/subject/[slug].tsx` (Books list), `apps/app/app/search.tsx` (results), `apps/app/app/lists/[id].tsx` (members), `apps/app/app/author/[id].tsx` if its works come through `WorkListSections`.

**Interfaces:**
- Produces: `skipTargetId(name: string): string` returning `skip-target-${name}` with whitespace turned to `-`, lowercased.
- Produces: `focusSkipTarget(id: string, doc: { getElementById(id: string): { focus(): void; scrollIntoView?(): void } | null }): boolean`, which focuses and scrolls to the element and returns whether it found one.
- Produces: `<SkipLink name="editions" label="Skip editions" />` and `<SkipTarget name="editions" />`. `SkipLink` returns `null` unless `Platform.OS === "web"`. It is a `Pressable` with `accessibilityRole="link"`, visually hidden (off-screen, 1px) until `focused`, then shown as a normal bordered link using `colors.focus` outline. `SkipTarget` is an empty `View` with `nativeID={skipTargetId(name)}` plus web `tabIndex={-1}` so it can take focus.

- [ ] **Step 1: Failing tests** in `skipLink.test.ts`: `skipTargetId("More by this author")` equals `skip-target-more-by-this-author`; `focusSkipTarget` calls `focus` and `scrollIntoView` on a fake element and returns `true`; returns `false` for a missing id and calls nothing.
- [ ] **Step 2: Run** `npm test -- skipLink`. Expected: FAIL.
- [ ] **Step 3: Implement** the two helpers, then `SkipLink.tsx` (calls `focusSkipTarget(skipTargetId(name), document)` on press).
- [ ] **Step 4: Wire in.** Place `<SkipLink>` immediately before each list's first row and `<SkipTarget>` immediately after its last row, with names: `editions`, `more-by-author`, `series`, `recommendations`, `subject-books`, `search-results`, `list-books`. Render the pair only when the list has more than 1 item (Review Focus). Do not change any screen's content otherwise.
- [ ] **Step 5: Manual keyboard check** in the web app (`run` skill): Tab from the page top, see "Skip editions" appear on focus, press Enter, the next Tab lands on the first control after the editions carousel. Repeat for the subject Books list and the search results.
- [ ] **Step 6: Run** `npm test`, typecheck. Expected: PASS.
- [ ] **Step 7: Commit** `feat(app): skip links over editions and book lists for keyboard users`.

### Task 7: Find connection matches View as graph

User: "make the find connection button on pages the same as the view graph button as before."

**Files:**
- Modify: `apps/app/app/work/[id].tsx:~121`, `apps/app/app/book/[isbn].tsx:~144`, `apps/app/app/author/[id].tsx:~89`

- [ ] **Step 1: In each of the three files** change the Find connection `Button` from `variant="pill"` to `variant="primary"` with `style={PRIMARY_ACTION_STYLE}` (already imported beside the View as graph button, as it was before commit 0c210cc). Keep its `accessibilityLabel`, hint and tooltip.
- [ ] **Step 2: Check** in the browser at phone width and desktop width: the two buttons share a row at equal width (`PRIMARY_ACTION_STYLE` is `flexGrow: 1, flexBasis: 0, maxWidth: 240`) and don't overflow. No unit test: this is a style swap with no logic (say so in the commit if asked).
- [ ] **Step 3: Run** `npm run typecheck`. Expected: PASS.
- [ ] **Step 4: Commit** `feat(app): Find connection is a primary action like View as graph`.
- [ ] **Step 5: Docs.** Add a short note to `docs/CODEBASE.md` for `SkipLink`, `memberCoverUrl` and `subjectIdentifiers`; commit `docs: note skip links, member covers and subject identifiers`.

### Task 8: Notable works on author pages open the work page

User: "Can notable works on author pages link to the work pages?" and "The notable works would be in the graph anyways so it shouldn't be an issue to get those ids."

Findings: `app/author/[id].tsx:157` sets `navigable` only for `influencedBy`/`influenced`, so notable works are never links. The graph builds notable-work nodes from the same relation data (`graphService.ts:108`): it uses `openLibraryId` when Wikidata has one and is non-navigable (`work:qid:…`) when not. So the page uses the same ids the graph does, and no new lookup is added. Cost: a notable work Wikidata has no `OL…W` id for stays plain text, exactly as in the graph.

**Files:**
- Create: `apps/app/src/relationHref.ts`, `apps/app/src/relationHref.test.ts`
- Modify: `apps/app/app/author/[id].tsx:157-172`

**Interfaces:**
- Produces: `relationHref(r: Pick<AuthorRelation, "relation" | "openLibraryId" | "label">): Href | null`. For `notableWork` with an id matching `/^OL\d+W$/` it returns `routes.work(id)`. For `influencedBy`/`influenced` with any id it returns `routes.work(id)` when the id ends in `W`, else `routes.author(id)` (today's behaviour). Everything else returns `null`. Task 10 adds the `award` case.

- [ ] **Step 1: Failing tests** in `relationHref.test.ts`: notable work `OL45883W` gives `routes.work("OL45883W")`; notable work with `null` id gives `null`; notable work with edition id `OL123M` gives `null`; `influencedBy` with `OL26320A` gives `routes.author("OL26320A")`; `influenced` with a `W` id gives the work route; `movement` gives `null`.
- [ ] **Step 2: Run** `npm test -- relationHref` in `apps/app`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `relationHref`. In the author screen drop the `navigable`/`isNavigable` logic and the inline `endsWith("W")` ternary; render the `Pressable` row with the chevron whenever `relationHref` returns a href. Movement rows stay plain text. Keep `ref={titleRef(`View ${item.label}`)}`.
- [ ] **Step 4: Run** `npm test` in `apps/app` and `npm run typecheck`. Expected: PASS. Then open an author with notable works (for example Ursula K. Le Guin) and click one through to its work page.
- [ ] **Step 5: Commit** `feat(app): notable works link to their work pages`.

Review Focus addition: a notable work with a null or edition id is plain text, not a dead link.

---

### Task 9: Award identity and data (shared + server)

User: "create award pages that enable awards in graphs and other pages to link to the award page. If you're able to get some basic data that would be helpful but otherwise the connections are the most important part."

Today an award is only a label: graph nodes are `award:<slug>` with `navigable: false` (`graphService.ts:65-69`), work pages show award chips from Open Library tags (`TermsSection.tsx:132`), and author pages list Wikidata P166 awards as plain text. There is no award record. Connections come from Wikidata: `searchReverseStatementQids("P166", qid)` already finds everything that won an item, and `resolveItems` gives labels and Open Library ids (both already used for authors and subjects). Basic data comes from the same item: description and Wikidata id.

**Files:**
- Modify: `packages/shared/src/index.ts` (near `awardFamily`, line ~241)
- Create: `apps/server/src/services/awardService.ts`, `apps/server/src/services/awardService.test.ts`, `apps/server/src/routes/awards.ts`, `apps/server/src/routes/awards.test.ts`
- Modify: `apps/server/src/sources/wikidata.ts` (add `searchAwardQid`, export `fetchAwardWinners`), `apps/server/src/index.ts` (register routes), `apps/server/src/services/graphService.ts:65` (use the shared helpers)

**Interfaces:**
- Produces (shared): `awardDisplayName(label: string): string` is `awardFamily(label)` with each word's first letter uppercased (the logic now inline in `awardNode`). `awardSlug(label: string): string` is `slugifySubject(awardDisplayName(label))`, so it equals the slug in today's graph node ids.
- Produces (shared): `AwardWinnerSchema = z.object({ kind: z.enum(["author", "work"]).nullable(), openLibraryId: z.string().nullable(), wikidataId: z.string(), label: z.string() })` (`kind` comes from the id suffix `A` or `W`, `null` when unknown) and `AwardSchema = z.object({ slug: z.string(), name: z.string(), wikidataId: z.string().nullable(), description: z.string().nullable(), winners: z.array(AwardWinnerSchema) })` with the inferred `Award` and `AwardWinner` types.
- Produces (server): `getAwardDetail(slug: string, label?: string): Promise<Award>`. The name is `awardDisplayName(label)` when a label is given, else the slug with underscores turned to spaces and title-cased. It never returns "not found": an award with no Wikidata match comes back with `wikidataId: null`, no description and `winners: []`. Route `GET /api/awards/:slug?label=` returns it. Winners are capped at 40, cached with the existing `TtlCache` pattern (see `subjectService.ts`), and Wikidata failures are optional (`optionalSource`), so the page still loads.
- Produces (wikidata): `searchAwardQid(name: string): Promise<string | null>` takes the first `wbsearchentities` hit whose description matches `/award|prize/i`, else `null`.

- [ ] **Step 1: Failing tests.** Shared: `awardSlug("Hugo Award for Best Novella")` equals `awardSlug("hugo award (1966)")` equals `"hugo_award"`; `awardDisplayName("hugo award")` is `"Hugo Award"`; `AwardSchema.parse` accepts a winner with `kind: null`. `awardService.test.ts` (mock `wikidata`): a found Q-id returns the description and winners with `kind` `"author"` for `OL26320A`, `"work"` for `OL45883W`, `null` for a null id; no Q-id returns `winners: []` and `wikidataId: null`; a thrown `fetchAwardWinners` still returns the award with `winners: []`; more than 40 winners are cut to 40. `routes/awards.test.ts`: 200 with the award body, and a slug over 100 characters answers 400.
- [ ] **Step 2: Run** `npm test` in `packages/shared` (if it has tests, else the app workspace) and `npm test -- award` in `apps/server`. Expected: FAIL.
- [ ] **Step 3: Implement** the shared helpers and schemas (make `awardNode` in `graphService.ts` call them so the node id and the page slug can't drift), `searchAwardQid`, `fetchAwardWinners` (reverse P166, then `resolveItems`), `getAwardDetail` and the route.
- [ ] **Step 4: Run** the same commands and `npm run typecheck`. Expected: PASS. Then `curl` the dev server for `/api/awards/hugo_award?label=Hugo%20Award` and confirm real winners come back.
- [ ] **Step 5: Commit** `feat(server): award details and winners from Wikidata`.

Review Focus addition: an award Wikidata doesn't know (or an Open Library tag like "nyt:…" turned award text) returns an empty-but-valid award, not a 404 or 500; two spellings of one award land on one slug.

### Task 10: Every award label links to its award page

**Files:**
- Modify: `apps/app/src/navigation.ts` (add `routes.award`, extend the graph-node href function at line ~48)
- Modify: `apps/app/src/relationHref.ts` (+test), `apps/app/src/components/TermsSection.tsx:132-145` (`AwardsSection`)
- Modify: `apps/server/src/services/graphService.ts:65-69` (`navigable: true`)
- Test: `apps/app/src/navigation.test.ts` (extend; create if absent), `apps/server/src/services/graphService.test.ts`

**Interfaces:**
- Consumes: `awardSlug`, `awardDisplayName` (Task 9).
- Produces: `routes.award(slug: string, label?: string): Href` returning `{ pathname: "/award/[slug]", params: label ? { slug, label } : { slug } }`, like `routes.subject`. The graph-node href function returns `routes.award(slug)` for ids `award:<slug>`. `relationHref` gains the `award` case: `routes.award(awardSlug(r.label), awardDisplayName(r.label))`, which needs no Open Library id.

- [ ] **Step 1: Failing tests.** `routes.award("hugo_award", "Hugo Award")` has the pathname and both params, and omits `label` when none is given; the node-href function maps `award:hugo_award` to the award route; `relationHref({ relation: "award", label: "Hugo Award for Best Novel", openLibraryId: null })` returns `routes.award("hugo_award", "Hugo Award")`; `graphService.test.ts`: award nodes on work and author graphs have `navigable: true`.
- [ ] **Step 2: Run** `npm test -- navigation relationHref` in `apps/app` and `npm test -- graphService` in `apps/server`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `AwardsSection` turn each chip into a `Pressable` (`accessibilityRole="link"`, label `titleCase(award)`, `titleRef(`View ${award}`)`) that pushes `routes.award(awardSlug(award), awardDisplayName(award))`; the author page already renders `relationHref` results, so award rows link with their chevron. The graph screen's node tap uses the href function, so check once that `navigable: true` is all it needs.
- [ ] **Step 4: Run** `npm test` in both workspaces and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: awards link to award pages from work pages, author pages and graphs`.

### Task 11: The award page

**Files:**
- Create: `apps/app/app/award/[slug].tsx`, `apps/app/src/awardWinners.ts`, `apps/app/src/awardWinners.test.ts`
- Modify: `apps/app/src/api/client.ts` (add `fetchAward(slug, label?)` with `AwardSchema`), `apps/app/app/_layout.tsx` (register `award/[slug]` with `title: "Award"` like the subject screen)

**Interfaces:**
- Consumes: `Award`, `AwardWinner`, `routes.award`, `routes.author`, `routes.work`.
- Produces: `groupWinners(winners: AwardWinner[]): { authors: AwardWinner[]; works: AwardWinner[]; others: AwardWinner[] }`, preserving order, with `kind: null` in `others`.

- [ ] **Step 1: Failing test** `awardWinners.test.ts`: a mixed list splits into the three groups in order; empty input gives three empty arrays.
- [ ] **Step 2: Run** `npm test -- awardWinners`. Expected: FAIL.
- [ ] **Step 3: Implement** `groupWinners`, `fetchAward`, and the screen modelled on `subject/[slug].tsx` (`useQuery`, `ErrorState`, `OfflineBanner`, `DetailTop` with the award name and `ShareButton`, `AboutSection` for the description). Under it: a "Winners" `accessibilityRole="header"` section with "Authors" and "Works" link rows (`PressableRow` to `routes.author`/`routes.work`; `others` as plain text), and an identifiers line for the Wikidata id linking to `https://www.wikidata.org/wiki/${id}` (same style as Task 5). With no winners show `EmptyState` "No winners found for this award yet." Wrap each of the two lists in the skip link pair from Task 6 (`awards-authors`, `awards-works`). The "View as graph" button arrives only if Task 12 is done.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, then open the page from a work's award chip and from the author page's awards, in light and dark themes. Expected: PASS, both links land on one page, winner rows open real author and work pages.
- [ ] **Step 5: Commit** `feat(app): award page with winners and links`.

### Task 12 (optional, cut if time is short): Award graph

Every other detail page has "View as graph"; an award with winners is a natural hub. If skipped, nothing else depends on it.

**Files:**
- Modify: `apps/server/src/services/graphService.ts` (add `buildAwardGraph(slug, label)`), `apps/server/src/routes/graph.ts` (accept type `award`), `apps/app/src/navigation.ts` (`routes.graph("award", slug)`), `apps/app/app/graph/[type]/[id].tsx` if it switches on type, `apps/app/app/award/[slug].tsx` (button)
- Test: `apps/server/src/services/graphService.test.ts`

**Interfaces:**
- Produces: `buildAwardGraph(slug: string, label?: string): Promise<Graph>`: a centre node `award:<slug>` (type `award`, `navigable: true`) plus one node per winner with an Open Library id (`author:<id>` or `work:<id>`, `navigable: true`) joined by `won` edges from winner to award. Winners with no Open Library id are left out of the graph (they stay on the page).

- [ ] **Step 1: Failing test:** two winners (one author, one work) and one unresolved winner produce three nodes (award + two) and two `won` edges pointing at the award.
- [ ] **Step 2: Run** `npm test -- graphService`. Expected: FAIL. **Step 3: Implement** the builder (reuse `getAwardDetail`) and wire the route type, then add the primary "View as graph" button to the award page, same style as the subject page. **Step 4: Run** all tests and typecheck, then open the graph and tap a winner. Expected: PASS. **Step 5: Commit** `feat: award graph`.

### Task 13: Graph toolbar: Filter and Share match each other and the Graph/List control

User: "the filter and share buttons are on even, can be in the right corner and even with eachother? They also seem odd next to the graph/list buttons."

Findings: the toolbar in `app/graph/[type]/[id].tsx:442-460` centres three different controls in one row (`toolbar`, line 883): a `SegmentedControl` (an outlined group with 3px padding and 38px options, so about 46px tall, `radii.button`), then two `variant="pill"` `Button`s (their own height and radius). The pill buttons already use `radii.button` (`Button.tsx:92`), so the mismatch is height (6px vertical padding against about 46px) and the shared centred row. `ShareButton` also wraps its button in a `View` whose "Copied" message is absolutely positioned at `left: 0`, so it would run off the screen once the button sits at the right edge.

Target: Graph/List on the left; Filter and Share together on the right, with the same height as the Graph/List control (the radius already matches); the row wraps cleanly at phone width instead of overflowing.

**Files:**
- Modify: `apps/app/app/graph/[type]/[id].tsx:442-460,883` (toolbar markup and styles)
- Modify: `apps/app/src/components/ShareButton.tsx` (new `align` prop)
- Modify: `apps/app/src/components/SegmentedControl.tsx` (export the height constant)
- Create: `apps/app/src/toolbarMetrics.ts`, `apps/app/src/toolbarMetrics.test.ts`

**Interfaces:**
- Produces: `TOOLBAR_CONTROL_HEIGHT = 46` in `toolbarMetrics.ts`, the outer height of the Graph/List control (38px option + 2 × 3px padding + 2 × 1px border). `SegmentedControl` derives its option `minHeight` from it (`TOOLBAR_CONTROL_HEIGHT - 8`), and the Filter and Share buttons get `minHeight: TOOLBAR_CONTROL_HEIGHT` through their `style` prop, so one number sets all three.
- Produces: `ShareButton` gains `align?: "left" | "right"` (default `"left"`). With `"right"` the status text is anchored `right: 0` with `textAlign: "right"`.

- [ ] **Step 1: Failing test.** `toolbarMetrics.test.ts`: `TOOLBAR_CONTROL_HEIGHT` is `46`, and `TOOLBAR_CONTROL_HEIGHT - 8` is `38`, the option height `SegmentedControl` renders today (guards against the two drifting apart).
- [ ] **Step 2: Run** `npm test -- toolbarMetrics` in `apps/app`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement.** Create the constant and use it in `SegmentedControl`. In the graph screen make `toolbar` `flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: spacing.sm`, keep the `SegmentedControl` as the first child, and wrap `Filter` and `ShareButton` in one inner `View` (`flexDirection: "row", gap: spacing.sm, marginLeft: "auto"`) so they sit together at the right even when the row wraps. Give both buttons the shared height, `style={{ minHeight: TOOLBAR_CONTROL_HEIGHT }}`; `ShareButton` forwards its `style` to its `Button` rather than only its wrapper (adjust the component so the visible button is what is styled), and passes `align="right"`. Keep the labels, `accessibilityLabel`s, tooltips and tab order (Graph, List, Filter, Share) unchanged.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck`. Expected: PASS. Then in the browser at desktop and phone width (and light and dark): the three controls share one height and corner radius; Filter and Share are the same size, side by side at the right edge; at phone width the row wraps without horizontal scroll; click Share and confirm the "Copied" text stays on screen.
- [ ] **Step 5: Commit** `fix(app): graph toolbar controls share a height, with Filter and Share at the right`.

Review Focus addition: on the narrowest phone width the toolbar wraps instead of clipping, and the share confirmation never runs off the right edge.

---

## Self-review

- Coverage: main fresh (checked), covers (T2), accounts on top (T4), Unlink labels (T3), subject identifiers (T5), skip links (T6), Hardcover 500 (T1), Find connection (T7). Every request has a task, including notable works (T8) and award pages (T9-T12) and the graph toolbar alignment (T13).
- Types: `HardcoverUnavailableError`, `memberCoverUrl`, `listServiceLabels`, `subjectIdentifiers`, `skipTargetId`, `focusSkipTarget` are named identically in every place they are used.
- Not covered by automated tests: Task 7's style swap and Task 4's screen order (only the row order is pinned); both get a manual browser check.
