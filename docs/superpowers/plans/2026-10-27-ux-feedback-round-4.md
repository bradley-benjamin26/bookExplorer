# UX Feedback Round 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address the 20 items in the 10/26 to-do list: a home link in every header, a smaller filter popup, Share that copies the link, hover text, recents for every page type, author photos, better social cards, English-only descriptions, more LOC data, fixed LCSH subject pages, subject and genre suggestions, one locked subject editor, an edition picker on save, better connections (authors, awards, no "Fiction"), clickable connection steps, accordion recommendations, and a Google Books check.

**Architecture:** Same as round 3. Logic goes in a pure module with a test beside it, and screens only wire it in. The server proxies every new upstream call (LOC suggest2, Open Library author search), so the client still talks only to `apps/server`. New fields on cached server types are `.optional()` in zod, because the persistent cache tier holds entries written before this release.

**Tech Stack:** Expo SDK 57 / Expo Router / React Native Web, TanStack Query, Fastify 5, zod, vitest, lucide-react-native.

**Spec:** `docs/10_26_to-dos.txt` (item numbers below cite it), plus these decisions from the user, 2026-10-27:
- Item 14: Save to list on a work asks for an ISBN edition and saves that edition as a book. If no edition has an ISBN, it saves the work as it does today. Works already on lists stay, and the CSV export fills their ISBN from the work's first-edition ISBN.
- Item 15c: tapping the lock on an unsaved item opens Save to list first, then unlocks editing.
- Item 18: id.loc.gov holds authority data only. Show LC Classification, Dewey number and LCCN from the LOC catalog record we already fetch, add a "View in LOC catalog" link, and use the record's summary as a last-resort description.
- Item 9: Find Connection picks authors as well as books, and awards become links.
- Item 19 (follow-up): normalize LCSH and Open Library subjects into one slug, rather than only patching the one empty page.

**Answers that need no code (put them in the PR description):**
- Item 18: id.loc.gov serves headings (subjects, genres, names), not book records. Book records come from the LOC catalog over SRU (`lx2.loc.gov/sru/lcdb`, MODS format), which the server already queries by ISBN. Task 9 reads more fields from it.
- Item 20: Google Books is still used, but only on the ISBN book page (`bookService.ts`), and only when the cover, the description or the rating is missing from every other source. The fallback degrades cleanly: a failure is cached briefly and the page still loads. But a keyless request got HTTP 429 on 2026-10-27, so in production the fallback works only if `GOOGLE_BOOKS_API_KEY` is set. Task 19 checks that.
- Social cards (item 5): on 2026-10-27, `curl -A "Twitterbot/1.0" https://shelfthread.com/graph/work/OL27513W` got Cloudflare's "Just a moment..." challenge page, not our tags. Spoofed user agents from a home IP get challenged anyway, so this proves nothing about real crawlers, but it is the first thing Task 7 checks.

**Out of scope:** the brand identity work in item 1 ("start developing theme/identity"). It needs its own brainstorm, so this plan only makes the name a persistent home link. Native Share keeps the system share sheet, because copying to the clipboard on native would need `expo-clipboard`, a new dependency. The complaint in item 4 came from Safari on a Mac.

## Global Constraints

- Read the Expo docs for v57 (`https://docs.expo.dev/versions/v57.0.0/`) before writing Expo code (`apps/app/AGENTS.md`).
- No new npm dependencies.
- Exact copy: "Shelf Thread", "Exploring {label}", "Copy a link to this page", "Link copied", "View {label}", "Open {label}", "Recently looked at", "All", "Books", "Authors", "Subjects", "Photo via Wikipedia", "via Library of Congress", "View in LOC catalog", "Subjects & Genres", "Edit subjects and genres", "Lock and save subjects and genres", "Choose an edition", "Save the work instead", "Both won: {award}", "Authors", "Books".
- The user's own tags never leave the device (the existing rule in `apps/app/src/recommendations.ts`). A suggestion request sends only the text being typed into the add field, which the user is sending on purpose.
- Test runners: app `cd apps/app && npx vitest run <file>`; server `cd apps/server && npx vitest run <file>`. Whole repo: `npm run typecheck && npm test` from the root.
- Screens are not unit-tested in this repo. Each screen task ends with a by-eye check on web: `npm run dev:server` plus `cd apps/app && npx expo start --web`, at 390×844 and at desktop width, in light and dark.
- Work on a new branch, `ux-feedback-round-4`, cut from `ux-feedback-round-3` (round 3 is not merged to `main` yet). Commit `docs/10_26_to-dos.txt` in the first commit. One commit per task, each message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Edits lost while unlocked.** Someone unlocks subjects, removes two and adds one, then taps a link or Back without relocking. The changes must be saved anyway: the section saves the draft on unmount, like `SavedRecordEditor` does for notes today. *Test: Task 13, `termsDraft` "draft differs from record"; plus a by-eye check.*
2. **Old recents vanish after the upgrade.** The old key holds bare ISBN strings (the oldest format) and `RecentBook` objects. Both must still show up as books. *Test: Task 5.*
3. **Suggest input from a hostile or broken client.** An empty `q`, a 101-character `q`, an unknown vocabulary, or LOC being down must give a 400 or `[]`, never a 500 or an injected upstream URL. *Test: Task 11.*
4. **The "Fiction" ban breaks a search that starts there.** Generic subjects are skipped as links in the middle of a path, but a search whose own end is `subject:fiction` must still run. *Test: Task 14.*
5. **One award splits into several nodes.** Open Library's "Hugo Award (1966)" and Wikidata's "Hugo Award for Best Novella" must become the same node, `award:hugo_award`, while "Nebula Award" stays separate. (Checked live: Zahn and Le Guin share "Hugo Award for Best Novella".) *Test: Task 15, `awardFamily`.*

---

### Task 1: Home link in every header; "Exploring X" graph title (items 1, 3)

**Files:**
- Create: `apps/app/src/components/HeaderTitle.tsx`
- Modify: `apps/app/app/_layout.tsx` (`screenOptions.headerTitle`), `apps/app/app/graph/[type]/[id].tsx`
- Create: `apps/app/src/graphTitle.ts`; Test: `apps/app/src/graphTitle.test.ts`

**Interfaces:**
- Produces: `exploringTitle(label: string | undefined): string`. Task 7 uses the same wording on the server.

- [ ] **Step 1: Write the failing test**

```ts
it("names the centred node", () => expect(exploringTitle("Dune")).toBe("Exploring Dune"));
it("falls back before data loads", () => expect(exploringTitle(undefined)).toBe("Explore Graph"));
```

- [ ] **Step 2: Run it.** `cd apps/app && npx vitest run src/graphTitle.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `exploringTitle` in `src/graphTitle.ts`.**
- [ ] **Step 4: `HeaderTitle({ children }: { children: string })`.** It renders a small "Shelf Thread" link (`accessibilityRole="link"`, `titleRef("Go to the home page")`, `router.replace("/")`, `fonts.display`, `colors.cover`, `typeScale.xs`) above the page title (the current header title style). Set it as `screenOptions.headerTitle: ({ children }) => <HeaderTitle>{children}</HeaderTitle>`. The `index` screen keeps `headerTitle: ""`, since Home already shows the big title.
- [ ] **Step 5: Graph screen.** Render `<Stack.Screen options={{ title: exploringTitle(centerLabel) }} />`, with `centerLabel = data?.nodes.find((n) => n.id === data.centerId)?.label`. It must update when the graph re-centres.
- [ ] **Step 6: Verify.** Run the test (PASS), then by eye: open `/graph/work/OL27513W` directly in a fresh tab. The header reads "Shelf Thread" over "Exploring The Lord of the Rings", and the browser tab shows that title too. Tapping "Shelf Thread" goes home. Re-centring changes the title. Check at 390 px wide, where the title must not push the header icons off screen.
- [ ] **Step 7: Commit** (`feat(app): Shelf Thread home link in every header; Exploring title on graphs`).

---

### Task 2: Filter opens a small popup (item 2)

**Files:** Modify `apps/app/app/graph/[type]/[id].tsx` (the filter `Modal` and the `sheetBackdrop`/`sheet` styles)

- [ ] **Step 1:** Change the modal to `animationType="fade"`. The backdrop centres its child (`justifyContent: "center", alignItems: "center"`, padding `spacing.lg`) and is a `Pressable` that closes the popup (`accessibilityLabel="Close filter"`). The popup is `width: "100%", maxWidth: 360, maxHeight: "70%"`, with `borderRadius: radii.sm` on every corner. A press inside the popup must not close it: wrap the content in a `Pressable` with an empty `onPress`, or use `onStartShouldSetResponder={() => true}`.
- [ ] **Step 2: Verify by eye.** On desktop, a card about 360 px wide sits in the middle with the graph dimmed behind it. On a phone, it is near full width but not a bottom sheet. Clicking outside closes it, toggling a checkbox does not, Escape (web) and the Android back button close it, and Done still closes it.
- [ ] **Step 3: Commit** (`fix(app): graph filter is a small popup, not a sheet`).

---

### Task 3: Share copies the link on web (item 4)

**Files:** Modify `apps/app/src/components/ShareButton.tsx` (`shareLink`)

- [ ] **Step 1:** On web, always call `navigator.clipboard.writeText(url)` and resolve `true`. Remove the `navigator.share` branch, which is what opens the macOS sheet with Notes and Freeform. Native keeps `Share.share` (see Out of scope). Update the doc comment.
- [ ] **Step 2: Verify.** Run `cd apps/app && npx vitest run src/share.test.ts` (the existing test, which must still pass). By eye in Safari and Chrome on macOS: Share shows "Link copied", pasting gives `https://<host>/…`, and no share sheet opens.
- [ ] **Step 3: Commit** (`fix(app): Share copies the link on web instead of opening the share sheet`).

---

### Task 4: Hover text everywhere (item 6)

**Files:** Modify `apps/app/app/graph/[type]/[id].tsx`, plus every icon-only `Pressable` that Step 1 finds

- [ ] **Step 1: Find the gaps.** Run `grep -rn "<Pressable" apps/app/app apps/app/src/components | grep -v titleRef`, and for each hit read the next ~10 lines to see whether it has a `ref={titleRef(...)}`. Every hit that is icon-only, or whose action isn't obvious from its text (chips, recents rows, Find This Book rows, the filter checkboxes), gets `ref={titleRef(...)}`, with text saying what it does. Subject and genre chips say `View {label}`. `Button` already accepts `tooltip`, so add one to any `Button` that lacks it.
- [ ] **Step 2: Graph nodes.** A navigable node that isn't the centre says `View {node.label}` (so an editions node reads "View Editions", and a subject "View Evil"). The centre says `Open {node.label}`. Non-navigable nodes keep `{label} has no page yet`.
- [ ] **Step 3: Verify by eye** on web: hover over the shelf icon ("My Library"), the magnifier ("New search"), a graph node, a chip and each zoom button.
- [ ] **Step 4: Commit** (`feat(app): hover text on every clickable icon and chip`).

---

### Task 5: Recents for books, works, authors and subjects (item 7)

**Files:**
- Modify: `apps/app/src/storage/history.ts`, `apps/app/src/storage/history.test.ts`, `apps/app/app/index.tsx`, and the callers that record a visit: `app/book/[isbn].tsx` (replace `addRecentBook`), `app/work/[id].tsx`, `app/author/[id].tsx`, `app/subject/[slug].tsx`

**Interfaces:**
- Produces:
  - `type RecentKind = "book" | "work" | "author" | "subject"`
  - `interface RecentItem { kind: RecentKind; id: string; title: string | null; subtitle: string | null }` (`subtitle` holds the authors for books and works, and nothing for the others)
  - `getRecent(): Promise<RecentItem[]>`, `addRecent(item: RecentItem): Promise<void>`
  - `recentOfKind(items: RecentItem[], filter: "all" | "books" | "authors" | "subjects"): RecentItem[]`, where "books" means book or work
  - `recentHref(item: RecentItem): Href`
- Keeps the storage key `book-explorer:recent-isbns`, so old entries migrate in place. `MAX_HISTORY` goes to 30.

- [ ] **Step 1: Write the failing tests**

```ts
it("reads legacy entries as books", async () => {
  await AsyncStorage.setItem("book-explorer:recent-isbns", JSON.stringify(["9780441172719", { isbn: "9780547928227", title: "The Hobbit", authorNames: ["J.R.R. Tolkien"] }]));
  expect(await getRecent()).toEqual([
    { kind: "book", id: "9780441172719", title: null, subtitle: null },
    { kind: "book", id: "9780547928227", title: "The Hobbit", subtitle: "J.R.R. Tolkien" },
  ]);
});
it("dedupes on kind and id, newest first", async () => {
  await addRecent({ kind: "author", id: "OL1A", title: "A", subtitle: null });
  await addRecent({ kind: "work", id: "OL1A", title: "W", subtitle: null }); // same id, different kind: kept
  await addRecent({ kind: "author", id: "OL1A", title: "A", subtitle: null });
  expect((await getRecent()).map((r) => `${r.kind}:${r.id}`)).toEqual(["author:OL1A", "work:OL1A"]);
});
it("filters books to books and works", () => {
  const items = [{ kind: "book" }, { kind: "work" }, { kind: "author" }, { kind: "subject" }].map((k, i) => ({ ...k, id: String(i), title: null, subtitle: null }) as RecentItem);
  expect(recentOfKind(items, "books").map((r) => r.kind)).toEqual(["book", "work"]);
});
```

- [ ] **Step 2: Run.** `cd apps/app && npx vitest run src/storage/history.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the storage functions, keeping `enqueueWrite`. Remove `getRecentBooks`, `addRecentBook` and `RecentBook`, and fix their callers.
- [ ] **Step 4: Wire the screens.** Each detail screen calls `addRecent` once its data lands (in a `useEffect` on `data`, like the book page does today). On Home, a pill row (`Button variant="pill"`, `active`) offers "All", "Books", "Authors" and "Subjects". The selection lives in state, and a pill shows only when that kind is present. Rows open `recentHref(item)` and show a small type label (from `NODE_LABELS`). Rows use the key `${kind}:${id}`.
- [ ] **Step 5: Run the tests (PASS).** Then by eye: visit a work, an author and a subject. All three are listed, the filters work, and an ISBN that was in recents before the upgrade is still there.
- [ ] **Step 6: Commit** (`feat(app): recents include works, authors and subjects, with filters`).

---

### Task 6: Author photo from Wikipedia (item 8)

**Files:**
- Modify: `packages/shared/src/index.ts` (`AuthorSchema`), `apps/server/src/sources/wikipedia.ts`, `apps/server/src/services/authorService.ts`, `apps/server/src/services/authorService.test.ts`, `apps/app/app/author/[id].tsx`

**Interfaces:**
- Produces: `AuthorSchema.photoUrl: z.string().nullable().optional()`. `WikipediaExtract` gains `imageUrl: string | null`, read from the REST summary's `thumbnail.source`. (Checked live: Timothy Zahn's summary has a 330×413 thumbnail.)

- [ ] **Step 1: Write the failing test** in `authorService.test.ts`, mocking `fetchWikipediaExtract` the way the file mocks its other sources: when the extract has `imageUrl: "https://upload.wikimedia.org/x.jpg"`, then `getAuthorDetail(...)` gives `photoUrl` that URL. With no Wikipedia match, `photoUrl` is `null`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.** Add `thumbnail?: { source?: string }` to `PageSummary`. The URL must start with `https://`, or it is treated as null. In `getAuthorDetail`, set `photoUrl: wikipedia?.imageUrl ?? null`.
- [ ] **Step 4: Author page.** When `photoUrl` is set, show an `expo-image` `Image` (120×150, `contentFit="cover"`, `borderRadius: 6`, `accessibilityLabel={`Photo of ${name}`}`) above the name, and under it a "Photo via Wikipedia" link to `bioSourceUrl`. Commons images carry their own licences, and the Wikipedia page credits them.
- [ ] **Step 5: Verify.** Run the test (PASS). By eye: `/author/<Zahn's OL id>` shows the photo, and an author with no Wikipedia article shows none and no gap.
- [ ] **Step 6: Commit** (`feat: author photos from Wikipedia`).

---

### Task 7: Social cards (item 5)

**Files:** Modify `apps/server/src/socialMeta.ts`, `apps/server/src/socialMeta.test.ts`, `docs/deploy-social-cards.md`

**Interfaces:**
- Consumes: `Author.photoUrl` (Task 6).

- [ ] **Step 1: Check what real crawlers get.** Paste `https://shelfthread.com/graph/work/OL27513W` into Facebook's Sharing Debugger (`developers.facebook.com/tools/debug`) and into `https://www.opengraph.xyz`, then look in Cloudflare → Security → Events for challenges to those crawlers. If they are challenged, add a WAF custom rule that skips Managed Challenge and Bot Fight Mode when `cf.client.bot` is true (verified bots only, so the rule can't be spoofed with a user agent). Write the rule into `docs/deploy-social-cards.md`. This is a dashboard change, so the user makes it. Ask before touching the Cloudflare account.
- [ ] **Step 2: Write the failing tests** in `socialMeta.test.ts`:
  - `renderSocialTags` emits `<meta name="twitter:card" content="summary_large_image" />`, plus `og:image:alt`, which equals the escaped title.
  - The author lookup uses `photoUrl` as `image` when it is set (mock `getAuthorDetail` as the file does).
- [ ] **Step 3: Run.** `cd apps/server && npx vitest run src/socialMeta.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** both changes.
- [ ] **Step 5: Verify.** Run the tests (PASS). After deploying, re-run the Sharing Debugger on the URL from Step 1. The card should show the cover, "Explore The Lord of the Rings by J.R.R. Tolkien · Shelf Thread", the description and shelfthread.com.
- [ ] **Step 6: Commit** (`feat(server): large-image social cards, author photos; doc the crawler rule`).

---

### Task 8: Descriptions are English (item 12)

**Files:**
- Create: `apps/server/src/language.ts`; Test: `apps/server/src/language.test.ts`
- Modify: `apps/server/src/services/workService.ts` (`description`), `apps/server/src/services/bookService.ts` (each description candidate before `descriptionSource` is picked)

**Interfaces:**
- Produces: `looksEnglish(text: string): boolean` and `englishOrNull(text: string | null): string | null`.

- [ ] **Step 1: Write the failing tests**

```ts
it.each([
  "Bilbo Baggins, a respectable, well-to-do hobbit, lives comfortably in his hobbit-hole until the day the wandering wizard Gandalf chooses him.",
  "A novel.", // under 5 words: kept, too short to judge
])("keeps English: %s", (t) => expect(looksEnglish(t)).toBe(true));
it.each([
  "Bilbo Bessac est un hobbit qui vit tranquillement dans son trou jusqu'au jour où le magicien Gandalf le choisit pour une aventure.",
  "Bilbo Bolsón es un hobbit que vive cómodamente en su agujero hasta el día en que el mago Gandalf lo elige para una aventura.",
  "Bilbo Beutlin ist ein Hobbit, der gemütlich in seiner Höhle lebt, bis der Zauberer Gandalf ihn für ein Abenteuer auswählt.",
  "ビルボ・バギンズは裕福なホビットで、魔法使いガンダルフに冒険へ誘われる。",
])("rejects non-English: %s", (t) => expect(looksEnglish(t)).toBe(false));
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** If more than 20% of the letters are outside Latin script, return false. Otherwise, if there are 5 or more words, return true when at least 8% of them are in a fixed set of about 40 common English function words ("the", "and", "of", "to", "a", "in", "is", "his", "her", "he", "she", "with", "for", "that", "until", …). Add a one-line `shortcut:` comment saying it is a stopword heuristic and to switch to a language-ID library if it misjudges real descriptions.
- [ ] **Step 4: Apply it.** Wikipedia's text is always English. Run Open Library's and Google Books' descriptions (and LOC's summary, after Task 9) through `englishOrNull` before any source is chosen, so a French Open Library description falls through to the next source.
- [ ] **Step 5: Run** `cd apps/server && npx vitest run src/language.test.ts src/services/bookService.test.ts src/services/workService.test.ts`. Expected: PASS.
- [ ] **Step 6: Commit** (`fix(server): drop non-English descriptions in favour of the next source`).

---

### Task 9: More from the LOC catalog record (item 18)

**Files:**
- Modify: `apps/server/src/sources/loc.ts` (`LocMetadata`, `parseModsRecord`, the `isEmpty` check in `fetchMetadataByAnyIsbn`), `apps/server/src/sources/loc.test.ts`, `packages/shared/src/index.ts` (`BookSchema`, `WorkSchema`, `descriptionSource`), `apps/server/src/services/bookService.ts`, `apps/server/src/services/workService.ts`, `apps/app/app/book/[isbn].tsx`, `apps/app/app/work/[id].tsx`

**Interfaces:**
- Produces:
  - `LocMetadata` gains `lcc: string | null`, `ddc: string | null`, `lccn: string | null` and `summary: string | null`, read from `<classification authority="lcc">`, `<classification authority="ddc">`, `<identifier type="lccn">` and `<abstract>` (checked live on ISBN 9780547928227).
  - `BookSchema`/`WorkSchema` gain `loc: z.object({ lcc: z.string().nullable(), ddc: z.string().nullable(), lccn: z.string() }).nullable().optional()`, set only when an LCCN exists.
  - `BookSchema.descriptionSource` gains `"loc"`. `WorkSchema` gains `descriptionSource: z.enum(["openLibrary", "loc"]).nullable().optional()`. A `"loc"` source shows a "via Library of Congress" credit that links to `https://lccn.loc.gov/{lccn}`.

- [ ] **Step 1: Write the failing test** in `loc.test.ts`: a MODS fixture holding the four elements above (copy them from the live record), with `parseModsRecord` returning `{ lcc: "PZ7.T5744 Ho 2012", ddc: "[Fic]", lccn: "2012545250", summary: "Bilbo Baggins, …" }` alongside the subjects. A record with an ISBN mismatch still returns all of them null.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement the parser and the schema fields.** `isEmpty` becomes "no subjects, no genres and no LCCN". The LOC summary is the last description fallback after Open Library: wikipedia → googleBooks → openLibrary → loc for books, and openLibrary → loc for works. Run it through `englishOrNull`.
- [ ] **Step 4: Screens.** In "Find This Book", add a "View in LOC catalog" row to `https://lccn.loc.gov/{lccn}` when `loc` is set, with a muted line above the rows: `LC call number {lcc} · Dewey {ddc}`, leaving out whichever is null.
- [ ] **Step 5: Verify.** Run `cd apps/server && npx vitest run src/sources/loc.test.ts` (PASS), then `npm run typecheck`. By eye: `/book/9780547928227` shows the call number and the link.
- [ ] **Step 6: Commit** (`feat: LC call number, LCCN and catalog link; LOC summary as last-resort description`).

---

### Task 10: One slug for LCSH and Open Library subjects (item 19)

**Files:**
- Modify: `packages/shared/src/index.ts` (`slugifySubject`), `apps/server/src/services/subjectService.ts`, `apps/server/src/sources/locLinkedData.ts` (`findSubjectHeadingUri`), `apps/server/src/routes/subjects.ts`, `apps/server/src/routes/graph.ts`, `apps/server/src/socialMeta.ts`, `apps/server/src/validation.ts` (`isPathEndpointId`), `apps/server/src/cache.ts` (`CACHE_SCHEMA_VERSION` 1 → 2), `apps/app/src/queryCache.ts` (`CACHE_SCHEMA_VERSION` 2 → 3)
- Test: the shared package's `slugifySubject` tests, `subjectService.test.ts`, `locLinkedData.test.ts`, `routes/subjects.test.ts`, `graphService.test.ts`

**Background (checked live, 2026-10-27).** LOC gives "Science fiction -- Authorship", which the app slugs as `science_fiction_--_authorship`: 0 works on Open Library. Open Library files the same heading as `science_fiction_authorship`, with 141 works. More probes:

| Slug | Works |
|---|---|
| `united_states_--_history_--_civil_war,_1861-1865` | 125 |
| `united_states_history_civil_war_1861-1865` | 2666 |
| `science_fiction,_american` / `science_fiction_american` | 1140 / 1140 (Open Library ignores commas) |
| `authors,_american_--_20th_century_--_interviews` | 4 |
| `authors_american_20th_century_interviews` | 0 (the rare case where `--` is better) |
| `dune_(imaginary_place)` / `dune_imaginary_place` | 60 / 0 (keep parentheses) |
| `african-americans` / `african_americans` | 108 / 44048 (different subjects; keep hyphens) |
| `children's_stories` / `childrens_stories` | 19359 / 41 (keep apostrophes) |
| `science_fiction.` | 53, a separate subject from `science_fiction` (keep periods) |

LCSH's suggest2 matches the collapsed form: `q=science fiction authorship` returns "Science fiction--Authorship" (sh2008111319).

The fix is to normalize the slug itself. Every subject and genre node, chip link, recommendation key and cache key already comes from `slugifySubject`, so once it is canonical, an LOC heading and Open Library's version of it become one subject page and one graph node. That is the connection item 19 asks for: Bio of an Ogre and Conversations With Octavia Butler then meet at `subject:science_fiction_authorship`.

**Interfaces:**
- Produces:
  - `slugifySubject(name)`: trim and lowercase, turn every `--` into a space, drop commas, collapse runs of whitespace and underscores to one `_`, and trim `_` from both ends. Leave everything else alone (see the table). It is idempotent, and it maps a legacy slug to its canonical form: `slugifySubject("science_fiction_--_authorship") === "science_fiction_authorship"`.
  - `isSubjectSlug` is unchanged. The subject route, the subject graph route, `socialMeta`'s subject entry and `isPathEndpointId` (for `subject:` and `genre:`) validate `slugifySubject(raw)` instead of `raw`, so old shared links still work.
  - `getSubjectDetail(slug)` and `getSubjectBooks(slug)` share `loadOlSubject(slug): Promise<OpenLibrarySubject | null>`. It fetches `slugifySubject(slug)` first. If that has 0 works and the raw slug is different, it fetches the raw slug (the `--` interviews case, which only arrives through old links). The cache key is the raw slug, and the returned `Subject.slug` is always canonical.
  - `findSubjectHeadingUri(name)` matches a hit when `slugifySubject(hit.aLabel)` equals `slugifySubject` of the name or of its singular/plural variant. It used to compare lowercase labels, which can never match the collapsed name Open Library now returns.
  - The graph screen needs no change: it centres on the server's `centerId`, which is canonical.

- [ ] **Step 1: Write the failing tests.**
  - `slugifySubject`: `"Science fiction -- Authorship"` and `"science_fiction_--_authorship"` → `"science_fiction_authorship"`. `"Science fiction--Authorship"` (the suggest2 spelling) → the same. `"United States -- History -- Civil War, 1861-1865"` → `"united_states_history_civil_war_1861-1865"`. `"Dune (Imaginary place)"` → `"dune_(imaginary_place)"`. `"African-Americans"` → `"african-americans"`. `"Children's stories"` → `"children's_stories"`. For every one of these, `slugifySubject(slugifySubject(x)) === slugifySubject(x)`.
  - `isSubjectSlug("science_fiction_authorship")` is true. `isSubjectSlug("science_fiction_--_authorship")` is false (it is legacy, not canonical).
  - Route: `GET /api/subjects/science_fiction_--_authorship` → 200, with `slug: "science_fiction_authorship"`.
  - Service, with `openLibrary.getSubject` mocked: given the `--` slug, it asks for `science_fiction_authorship` first and returns its 141 works. When the canonical slug has 0 works and the raw `authors,_american_--_20th_century_--_interviews` has 4, it returns those 4, with `slug` set to the canonical form.
  - `findSubjectHeadingUri("science fiction authorship")`, with fetch stubbed to return `{ hits: [{ aLabel: "Science fiction--Authorship", uri: "http://id.loc.gov/authorities/subjects/sh2008111319" }] }`, gives that URI. The existing near-miss test (`"Fairy tales--Adaptations"` must not match `"Fairy tales"`) still passes.
  - Graph: a work whose LOC subject is "Science fiction -- Authorship" and a work whose Open Library subject is "science fiction authorship" both link to the one node `subject:science_fiction_authorship`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement**, and bump both `CACHE_SCHEMA_VERSION`s. Cached graphs and persisted queries hold old node ids, which would split a subject in two until they expire.
- [ ] **Step 4: Run `npm run typecheck && npm test` from the root (PASS).** Then by eye: `/subject/science_fiction_--_authorship` lists works and shows LCSH broader/narrower concepts. On `/work/OL43656212W`, the "Science fiction -- Authorship" chip opens `/subject/science_fiction_authorship`.
- [ ] **Step 5: Commit** (`fix: one canonical subject slug for LCSH and Open Library headings`).

---

### Task 11: Subject and genre suggestions API (items 16, 17)

**Files:**
- Create: `apps/server/src/routes/suggest.ts`; Test: `apps/server/src/routes/suggest.test.ts`
- Modify: `apps/server/src/sources/locLinkedData.ts` (new `suggestHeadings`), `apps/server/src/index.ts` (register the route), `apps/app/src/api/client.ts` (new `suggestTerms`)

**Interfaces:**
- Produces:
  - `GET /api/suggest/:vocab?q=` with `vocab` one of `subjects` (LCSH) or `genres` (LCGFT, id.loc.gov `genreForms`). It returns `string[]`, at most 8.
  - Server: `suggestHeadings(vocab: "subjects" | "genreForms", q: string): Promise<string[]>`, which calls `https://id.loc.gov/authorities/{vocab}/suggest2?q=…&count=8` and maps `hits[].aLabel`, with `--` rewritten to ` -- ` to match how MODS headings are shown. It is cached for 1 day in a memory-only `TtlCache` (no namespace, the same reason as `searchCache`: user text).
  - Client: `suggestTerms(kind: "subjects" | "genres", q: string): Promise<string[]>`.

- [ ] **Step 1: Write the failing tests** (use the Fastify `inject` style of the existing route tests):
  - `subjects?q=science fiction auth` → 200, `["Science fiction -- Authorship"]` (stub `fetch` with the suggest2 shape: `{ hits: [{ aLabel: "Science fiction--Authorship" }] }`)
  - a missing `q`, a `q` under 2 characters or a `q` over 100 → 400
  - an unknown vocabulary (`/api/suggest/names?q=abc`) → 400
  - upstream 500 → 200 `[]`
  - a `q` holding `&count=9999` gets URL-encoded into the upstream URL (assert on the stubbed call)
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the source function, the route (global rate limit, `encodeURIComponent(q)`) and the client function, which validates its result with `z.array(z.string())`.
- [ ] **Step 4: Run** `cd apps/server && npx vitest run src/routes/suggest.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** (`feat: LCSH and LC genre suggestions endpoint`).

---

### Task 12: Save to list on a work picks an edition (item 14)

**Files:**
- Create: `apps/app/src/components/WorkSaveButton.tsx`, `apps/app/src/editionChoice.ts`; Test: `apps/app/src/editionChoice.test.ts`
- Modify: `apps/app/src/components/AddToListButton.tsx` (imperative `open`), `apps/app/app/work/[id].tsx`, `apps/app/src/navigation.ts` (`routes.book` gains `options?: { edit?: boolean }`, which becomes the `edit: "1"` param), `apps/app/src/csv.ts` (`booksToCsv`), `apps/app/src/csv.test.ts`, and the `booksToCsv` caller

**Interfaces:**
- Produces:
  - `export type SaveSheetHandle = { open: () => void }`. `AddToListButton` and `WorkSaveButton` both take `ref?: Ref<SaveSheetHandle>` (React 19 ref-as-prop plus `useImperativeHandle`). Task 13 uses it.
  - `isbnEditions(editions: Edition[]): Edition[]`: editions that have an ISBN, deduped by ISBN, in the order the work page shows them.
  - `savedEditionOf(books: SavedBookRecord[], workId: string): SavedBookRecord | null`: the first live saved book whose `openLibraryWorkId` is `workId`.
  - `WorkSaveButton({ work, onSaved, ref }: { work: Work; onSaved: (isbn: string | null) => void; ref?: Ref<SaveSheetHandle> })`
  - `booksToCsv(books, lists, works = [], workIsbn: (workId: string) => string | null = () => null)`

- [ ] **Step 1: Write the failing tests**

```ts
it("keeps editions with an ISBN, once each", () => {
  const e = (id: string, isbn: string | null) => ({ openLibraryEditionId: id, isbn, format: null, publisher: null, publishDate: null, coverUrl: null });
  expect(isbnEditions([e("1", "111"), e("2", null), e("3", "111"), e("4", "222")]).map((x) => x.openLibraryEditionId)).toEqual(["1", "4"]);
});
it("finds a saved edition of the work", () => { /* one book with openLibraryWorkId "OL1W", one deleted: returns the live one */ });
```

In `csv.test.ts`, a saved work's row gets the ISBN13 cell from `workIsbn`, and an ISBN-10 goes in the ISBN cell.

- [ ] **Step 2: Run** `cd apps/app && npx vitest run src/editionChoice.test.ts src/csv.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the helpers and `booksToCsv`.** The caller passes `(id) => queryClient.getQueryData<Work>(["work", id])?.isbn ?? null`. The offline cache keeps saved works' details (`prefetchSaved`).
- [ ] **Step 4: `WorkSaveButton`.** It shows a "Save to list" pill. Pressing it (or `ref.open()`), when `isbnEditions(work.editions)` is non-empty, opens a "Choose an edition" modal (styled like Task 2's popup) with one row per edition: cover thumbnail, format, publisher, date and ISBN. Picking a row mounts an `AddToListButton` for `{ type: "book", id: isbn, title: work.title }`, hidden from view, and calls its `open()`. Its `onSave` fetches the book through `queryClient.fetchQuery({ queryKey: ["book", isbn], queryFn: () => fetchBookWithAlternate(isbn) })` and then `saveBook(book)`. After a save, it calls `onSaved(isbn)`. With no ISBN editions, it renders today's work `AddToListButton` and calls `onSaved(null)` after a save.
- [ ] **Step 5: Work page.** Replace the `AddToListButton` with `WorkSaveButton`. `onSaved(isbn)` with an ISBN does `router.push(routes.book(isbn))`. When `savedEditionOf` finds a saved edition, show a line under the button: "Saved: {format ?? "edition"} {isbn}", linking to that book page.
- [ ] **Step 6: Verify.** Run the tests (PASS). By eye: on `/work/OL27513W`, Save to list → choose an edition → pick a list → Done lands on that book page, saved. Exporting the CSV shows the ISBN. A work with no ISBN editions saves as a work, as before.
- [ ] **Step 7: Commit** (`feat(app): saving a work picks an ISBN edition; CSV fills work ISBNs`).

---

### Task 13: One locked Subjects & Genres section (items 15a-d, 16, 17)

**Files:**
- Create: `apps/app/src/components/TermsSection.tsx`, `apps/app/src/termsDraft.ts`; Test: `apps/app/src/termsDraft.test.ts`
- Modify: `apps/app/src/components/SavedRecordEditor.tsx` (notes only: delete `TagEditor` and its subject and genre state), `apps/app/app/book/[isbn].tsx`, `apps/app/app/work/[id].tsx`

**Interfaces:**
- Consumes: `suggestTerms` (Task 11), `SaveSheetHandle` and `WorkSaveButton` (Task 12), and the `edit` param on `routes.book` (Task 12).
- Produces:
  - `addTerm(list: string[], value: string): string[]`, which trims and skips blanks and any term whose `subjectKey` is already present; `removeTerm(list, value)`; and `draftChanged(draft: { subjects: string[]; genres: string[] }, record: { subjects: string[]; genres: string[] }): boolean`
  - `TermsSection({ subjects, genres, awards, record, onUpdate, onRequestSave, startUnlocked })`, where `subjects`/`genres` are labels (the record's once saved, the API's before that); `record: { subjects: string[]; genres: string[] } | null`; `onUpdate: (c: { subjects: string[]; genres: string[] }) => Promise<unknown>`; `onRequestSave: () => void`; and `startUnlocked?: boolean`

**Decision recorded (15b):** "combined" means one section, "Subjects & Genres", in place of today's two displays (the editable editor and the read-only chips on the book page). Genres and subjects stay as two chip rows inside it, keeping their two colours, because the recommendations and the graph treat them differently. Awards stay a separate, read-only row. If the user wants a single mixed row, that is a styling change inside `TermsSection`.

- [ ] **Step 1: Write the failing tests**

```ts
it("adds a trimmed term once, ignoring near-duplicates", () => {
  expect(addTerm(["Science fiction"], "  science-fiction ")).toEqual(["Science fiction"]);
  expect(addTerm(["Science fiction"], "Space opera")).toEqual(["Science fiction", "Space opera"]);
  expect(addTerm([], "   ")).toEqual([]);
});
it("draft differs from record", () => {
  expect(draftChanged({ subjects: ["a"], genres: [] }, { subjects: ["a"], genres: [] })).toBe(false);
  expect(draftChanged({ subjects: [], genres: [] }, { subjects: ["a"], genres: [] })).toBe(true);
});
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement `termsDraft.ts`.**
- [ ] **Step 4: `TermsSection`.**
  - The heading row reads "Subjects & Genres", with a lock button: lucide `Lock`, or `LockOpen` while unlocked; `accessibilityLabel`/`titleRef` "Edit subjects and genres" when locked, and "Lock and save subjects and genres" when unlocked.
  - **Locked (the default):** chips are tappable and open `routes.subject(slugifySubject(label))` (15d).
  - **Unlocked:** each chip shows ×, and tapping it removes the chip from a local draft. Under each row is an add input with debounced (300 ms, minimum 3 characters) suggestions from `suggestTerms("subjects" | "genres", q)`, at most 8 rows. Tapping a suggestion adds it, and Enter adds the typed text as-is (freeform, item 17).
  - **Saving:** tapping the lock again saves through `onUpdate` when `draftChanged`, then locks. Saving on unmount works the same way (Review Focus 1). A failed save keeps the section unlocked and shows the error.
  - **Lock with `record === null`:** call `onRequestSave()` and remember a pending unlock. When `record` becomes non-null, unlock.
  - On a phone, a suggestion request that fails just shows no suggestions.
- [ ] **Step 5: Book page.** Replace the Genre column, the Subjects section and the editor's tags with one `TermsSection`. `onRequestSave` calls the `AddToListButton` ref's `open()`, and `startUnlocked={edit === "1"}`. Show all subjects, not `slice(0, 12)`: the section is the only list now. Format stays where it is, and `SavedRecordEditor` keeps notes.
- [ ] **Step 6: Work page.** Use the same section. `onRequestSave` calls the `WorkSaveButton` ref's `open()`. When that saves an edition, Task 12's `onSaved` opens `routes.book(isbn, { edit: true })`, so editing continues on the saved edition. When it saves the work itself, the section unlocks in place.
- [ ] **Step 7: Verify.** Run the test (PASS), then by eye on a saved book:
  - only one set of subjects shows
  - chips open subject pages while locked
  - unlock, remove one, add "Science fiction -- Auth…" from the suggestions, and lock: the changes persist after a reload
  - unlock, edit, press Back: the changes are saved
  - on an unsaved book, the lock opens Save to list, and the section unlocks after Done
- [ ] **Step 8: Commit** (`feat(app): one locked Subjects & Genres section with LC suggestions`).

---

### Task 14: No "Fiction" in connections (item 10)

**Files:** Modify `apps/server/src/services/graphQuery.ts` (`settle`), `apps/server/src/services/graphQuery.test.ts`

**Interfaces:**
- Produces: `GENERIC_SUBJECT_SLUGS: ReadonlySet<string>` = `fiction`, `juvenile_fiction`, `fiction_general`, `young_adult_fiction`, `juvenile_literature`, `literature`, `novels`, `general`, plus `isGenericSubject(nodeId: string): boolean`, which is true for `subject:` or `genre:` ids whose slug is in the set. Add a `shortcut:` comment noting it is a fixed list, and that a work-count cut-off is the upgrade if more broad terms show up.

- [ ] **Step 1: Write the failing tests** (reuse the file's fake `Neighbours` helpers):
  - A graph where the only route from `work:A` to `work:B` is through `subject:fiction` → `{ found: false }`. The same graph through `subject:space_opera` → found.
  - A search **from** `subject:fiction` to `work:A` that links directly → found (Review Focus 4).
- [ ] **Step 2: Run.** Expected: FAIL on the first test.
- [ ] **Step 3: Implement.** In `settle`, skip a `next` for which `isGenericSubject(next)` is true, unless `next` is one of the two search ends.
- [ ] **Step 4: Run** `cd apps/server && npx vitest run src/services/graphQuery.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** (`fix(server): connections never go through Fiction-like catch-all subjects`).

---

### Task 15: Awards link authors and works (items 9, 11)

**Files:**
- Modify: `packages/shared/src/index.ts` (`AuthorRelationSchema.relation` adds `"award"`, `GraphNodeSchema.type` adds `"award"`, new `awardFamily`), `apps/server/src/sources/wikidata.ts` (`fetchAuthorRelations` reads P166), `apps/server/src/services/graphService.ts` (`authorGraph`, `workGraph`), `apps/server/src/services/workService.ts` (`WorkLinks` gains `awards`; `getWorkLinks` runs `splitSubjectTerms`, which also stops raw `award:` tags from showing up as subjects there), `apps/server/src/services/graphQuery.ts` (`summarise`), `apps/app/src/graphLabels.ts` (`NODE_LABELS.award = "Award"`, `RELATION_LABELS.won = "won"`), `apps/app/src/themeColors.ts` (`graphAward`: light `#8a6d1f`, dark `#e0c27a`, which must pass the contrast test in `theme.test.ts`), `apps/app/app/graph/[type]/[id].tsx` (`nodeColors`)
- Test: `packages/shared` tests live in `apps/server/src/subjectTerms.test.ts`, so add `awardFamily` there, plus `graphService.test.ts`, `graphQuery.test.ts` and `apps/app/src/graphLabels.test.ts`

**Interfaces:**
- Produces:
  - `awardFamily(label: string): string`, which drops a trailing `(…)` and anything from " for " on.
  - Award nodes: `{ id: "award:" + slugifySubject(awardFamily(label)), type: "award", label: awardFamily(label), navigable: false }`, with edges `{ source: <author or work>, target: awardId, relation: "won" }`.
  - Award nodes have no graph of their own: `graphNeighbours` returns null for them, which is enough for two sides meeting there to record a path.
  - `nodeHref` returns null for them (the existing fallthrough).

- [ ] **Step 1: Write the failing tests**
  - `awardFamily("Hugo Award for Best Novella")` → `"Hugo Award"`, `awardFamily("Hugo Award (1966)")` → `"Hugo Award"`, and `awardFamily("Nebula Award")` → `"Nebula Award"` (Review Focus 5).
  - In `graphService`, an author with relations `[{ relation: "award", label: "Hugo Award for Best Novella", … }]` yields node `award:hugo_award` and edge `won`, and a work with `awards: ["Hugo Award (1966)"]` yields the same node id.
  - In `graphQuery`, two authors that each link to `award:hugo_award` → found, `summary: "Both won: Hugo Award"`.
  - In `graphLabels`, `relationLabel("won")` → `"won"`.
- [ ] **Step 2: Run** those files. Expected: FAIL.
- [ ] **Step 3: Implement.** In `fetchAuthorRelations`, use `claimItemIds(center, "P166")` → `toAuthorRelations(…, "award", resolved)`. Award relations need no Open Library id. `authorGraph`'s `relations` loop gets an `award` branch, and `workGraph` adds award nodes from `work.awards`. Both dedupe through `cleanGraph`. `summarise` handles a single middle node of type award.
- [ ] **Step 4: Run** `npm run typecheck && npm test` from the root. Expected: PASS. The author page's relation sections must not render `award` as an unknown section: check `app/author/[id].tsx` and skip or label it "Awards".
- [ ] **Step 5: Commit** (`feat: awards link authors and works in graphs and connections`).

---

### Task 16: Find Connection picks authors too (item 9)

**Files:**
- Modify: `apps/server/src/sources/openLibrary.ts` (`searchAuthors`), `apps/server/src/routes/search.ts` (new `GET /api/search/authors?q=`), `apps/server/src/routes/search.test.ts`, `apps/app/src/api/client.ts` (`searchAuthors`), `apps/app/src/connectionSteps.ts` (+ test), `apps/app/app/connection.tsx`

**Interfaces:**
- Produces:
  - Server: `searchAuthors(name: string, limit: number): Promise<{ openLibraryId: string; name: string }[]>`, with `searchAuthorByName` re-implemented as `(await searchAuthors(name, 1))[0] ?? null`. The route returns at most 5, applies the same 3-character minimum as book search, and caches in memory only.
  - Client: `searchAuthors(q: string): Promise<AuthorRef[]>`.
  - `type Endpoint = { id: string; label: string }`, a node id like `"author:OL1A"`. `connectionStep(from: string | undefined, start: Endpoint | null, target: Endpoint | null)` keeps the same three results.

- [ ] **Step 1: Write the failing tests.** In `search.test.ts`, `/api/search/authors?q=ab` → 200 `[]` without an upstream call, and `?q=zahn` maps `docs[].key/name` (stubbed). In `connectionSteps.test.ts`, update the existing cases to `Endpoint` values.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** In `connection.tsx`, `start` and `target` become `Endpoint`, and `from`/`to` are their ids. The picker list shows an "Authors" header with up to 3 author rows (name; type label "Author"; tapping picks `author:{id}`), then a "Books" header with the existing `WorkListRow`s. Leave out the starting endpoint itself. Rename the copy "Choose the first book" to "Choose the first book or author", the placeholder to "Search for a book or author", and "Pick two books" in the explainer to "Pick two books or authors".
- [ ] **Step 4: Run** the tests (PASS). By eye: start from the Timothy Zahn author page, then Find Connection → "Le Guin" → pick Ursula K. Le Guin. The result shows a path, and the best match should be "Both won: Hugo Award" once Task 15 is in.
- [ ] **Step 5: Commit** (`feat: Find Connection connects authors as well as books`).

---

### Task 17: Connection steps open their pages (item 11)

**Files:** Modify `apps/app/app/connection.tsx` (the `pathSteps` rows)

- [ ] **Step 1:** Each step's node box becomes a `Pressable`, with `href = step.node.navigable ? nodeHref(step.node.id) : null`. With an `href`, it gets `accessibilityRole="link"`, the existing `accessibilityLabel`, `titleRef(`Open ${label}`)`, a trailing `ChevronRight`, and `router.push(href)`. Without one (award or `qid:` nodes), it stays a plain `View`. Move the `accessible`/`accessibilityLabel` from the wrapper `View` onto the `Pressable`, so screen readers get one focus stop per step.
- [ ] **Step 2: Verify by eye.** Author steps open the author page, book steps the work page, and subject steps the subject page. An award step isn't tappable.
- [ ] **Step 3: Commit** (`feat(app): each step of a connection opens its page`).

---

### Task 18: Recommendations accordion, more categories (item 13)

**Files:** Modify `apps/app/src/recommendations.ts` (constants), `apps/app/src/recommendations.test.ts` (any test pinned to the old constants), `apps/app/src/components/RecommendationsSection.tsx`

- [ ] **Step 1: More categories.** `TOP_SUBJECTS` 5 → 10, `TOP_AUTHORS` 3 → 6, `MAX_RECOMMENDATIONS` 10 → 60. Each group then shows at most 8 rows (`MAX_PER_GROUP = 8` in `recommendations.ts`, applied when grouping in the component). Update any test whose expectations count on the old caps, and run `cd apps/app && npx vitest run src/recommendations.test.ts` (PASS).
- [ ] **Step 2: Accordion.** Each group's heading becomes a `Pressable` row: heading text, `({recs.length})`, and a `ChevronDown` (expanded) or `ChevronRight` (collapsed), with `accessibilityRole="button"`, `accessibilityState={{ expanded }}` and `titleRef`. Only the first group starts expanded. The expanded set is kept in state and keyed by `reasonKey`, so it survives refetches.
- [ ] **Step 3: Verify by eye** with a library of 6 or more saved books: more groups than before, one open, the rest collapsed, and toggling works with keyboard and screen reader.
- [ ] **Step 4: Commit** (`feat(app): recommendations as an accordion with more categories`).

---

### Task 19: Google Books fallback check (item 20)

**Files:** Modify `apps/server/src/index.ts`

- [ ] **Step 1:** At startup, when `NODE_ENV === "production"` and `GOOGLE_BOOKS_API_KEY` is unset, log one warning: `GOOGLE_BOOKS_API_KEY is not set; the keyless Google Books quota is usually exhausted, so cover/description fallbacks will fail`.
- [ ] **Step 2: Production check (the user runs it, or confirms first):** on the server, confirm that the variable is set in the service's environment. Then `curl https://shelfthread.com/api/books/isbn/<an ISBN whose Open Library record has no cover>` and check that `coverSource` is `"googleBooks"`, or look in the server logs for `googleBooks` optional-source failures.
- [ ] **Step 3: Run** `cd apps/server && npx vitest run src/services/bookService.test.ts` (the existing fallback test passes).
- [ ] **Step 4: Commit** (`chore(server): warn when Google Books runs keyless in production`).

---

### Task 20: Whole-branch check

- [ ] **Step 1:** `npm run typecheck && npm test` from the root. Expected: all pass.
- [ ] **Step 2:** By eye at 390×844 and desktop, in light and dark: Home (recents filters), a book, a work (edition save), an author (photo), a subject (`science_fiction_--_authorship`), the graph (title, popup filter, hover) and Find Connection (Zahn → Le Guin, tappable steps).
- [ ] **Step 3:** Write the PR description with the "Answers that need no code" section above, and the Cloudflare rule if Task 7 needed one.
