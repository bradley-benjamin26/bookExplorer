# UX Refresh Phase B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app's structure match its identity: one wordmark header, a My Library that is a shelf of lists, left-aligned detail pages with reordered actions, external-link rows for off-app links, the thread on Home and as a section divider, and skeleton loading.

**Architecture:** Starts from `main` after BOTH the polish branch (`worktree-library-hardcover-polish`) and Phase A (`feat/ux-refresh-a`) have merged. Each task is one screen-level change built on shared pieces added early: a `card` colour token (Task 1), a `PressableRow` using Phase A's `pressedBackground`/`hoverBackground` (Task 2), and a `Skeleton` (Task 7). Pure logic (cover-stack URLs, header line rule) gets vitest tests; screens are verified by typecheck, the web export and manual checks.

**Tech Stack:** Expo SDK 57 / Expo Router, React Native (web + native), lucide-react-native, expo-image, vitest.

**Spec:** `docs/UX_REVIEW_2026-11-01.md` (findings 2, 3, 5, 6, 7, 10; "Design plan → card, thread, Home order"; "Order of work → Phase B").

## Global Constraints

- Branch off `main` only after the polish branch and Phase A are merged. Task 0 checks this. Never work on `main`.
- Expo SDK 57: read https://docs.expo.dev/versions/v57.0.0/ before touching an Expo API (`apps/app/AGENTS.md`).
- No new dependencies. App tests are vitest on pure logic only; no component-test setup is added.
- Commands, from the repo root: `npm test -w apps/app -- <pattern>`, `npm run typecheck`, `cd apps/app && npx expo export --platform web`.
- Style: colours, fonts, spacing and radii only from the theme via `useThemedStyles`; radii are small 8, medium 14, pill (Phase A); shadow only on covers and the centred modal; one-line why-comments; keep every `titleRef(...)` tooltip and accessibility prop.
- Wordmark: Fraunces 500, about 20px, one size on every screen. Detail pages are no longer titled "Book", "Work", "Author", "Subject" in the header.
- Chevrons mean "deeper in the app"; links that leave the app use an external-link icon (`ExternalLink` from lucide-react-native).
- WCAG: any new token pair gets a contrast test in `src/theme.test.ts` (text ≥ 4.5:1, borders and non-text ≥ 3:1). Skeletons are hidden from assistive tech and the loading state keeps a screen-reader label.
- Copy: empty states say what to do next, e.g. "Save a book from its page to start a list". No eyebrow labels, ALL-CAPS tags or arrow suffixes.
- Do not change the Hardcover, Save-to-list, Edit/Save or accordion behaviour from the polish plan.

## Review Focus

1. **Deep link / refresh onto a utility page keeps its title.** The wordmark-only header must still show a second line on Settings, Lists, Import & Export (and not on detail pages). Test: Task 3.
2. **A list with zero members, or with members that have no cover, renders a placeholder stack, not a broken image or a crash.** Test: Task 4.
3. **My Library with no lists shows the empty-state copy and still shows Hardcover and Tools.** Check: Task 4 manual step.
4. **A work or book with no `openLibraryWorkId` hides View as Graph / Find Connection, and the actions row does not leave a gap.** Check: Task 5.
5. **Skeletons never replace error or offline states, and a screen that is loading cached-then-fresh data does not flash a skeleton over cached content.** Check: Task 7.

---

### Task 0: Confirm the base

- [ ] **Step 1:** In a new worktree off `main`, branch `feat/ux-refresh-b`. Run `git log --oneline main | grep -i -e "polish" -e "refresh-a"` and `grep -n "pressedBackground" apps/app/src/themeColors.ts`. Expected: both prior efforts are merged and the token exists. If not, stop and ask: this plan assumes both.
- [ ] **Step 2:** Run `npm test -w apps/app` and `npm run typecheck`. Expected: all green (the baseline).

---

### Task 1: `card` colour token

**Files:**
- Modify: `apps/app/src/themeColors.ts`, `apps/app/src/components/CenteredModal.tsx`
- Test: `apps/app/src/theme.test.ts`

**Interfaces:**
- Produces: `ThemeColors.card: string` (light `#FFFDF8`, dark `#24221E`), used by Tasks 4 and 5 for raised rows and covers.

- [ ] **Step 1: Write the failing tests** in the contrast table: `["ink on card", c.ink, c.card, 4.5]`, `["textMuted on card", c.textMuted, c.card, 4.5]`, `["cover on card", c.cover, c.card, 4.5]`.
- [ ] **Step 2: Run** `npm test -w apps/app -- theme`. Expected: FAIL (`card` undefined).
- [ ] **Step 3:** Add `card` to the `ThemeColors` interface and both palettes. In `CenteredModal.tsx` change the card's `backgroundColor` from `colors.paper` to `colors.card`.
- [ ] **Step 4: Run** `npm test -w apps/app -- theme` (PASS) and `npm run typecheck` (exit 0).
- [ ] **Step 5: Commit:** `git add apps/app/src && git commit -m "feat(app): add the card surface token"`

---

### Task 2: Shared `PressableRow`

**Files:**
- Create: `apps/app/src/components/PressableRow.tsx`
- Modify: `apps/app/app/saved.tsx` is NOT touched here (Task 4). Replace the hand-rolled row in `apps/app/src/components/FindLinkRow.tsx` only in Task 6.

**Interfaces:**
- Produces: `PressableRow({ label, onPress, tooltip?, accessibilityLabel?, accessibilityState?, children, trailing?, divider? }: PressableRowProps): JSX.Element`. Renders a ≥44pt `Pressable` with 12px vertical padding, a `colors.cardBorder` bottom rule when `divider` (default true), `pressedBackground` on press and `hoverBackground` on web hover, a focus ring in `colors.cover`, and `trailing` at the right edge (the caller chooses chevron or external-link icon). `tooltip` goes through `titleRef`. No `onPress` ⇒ renders disabled with no hover tint.

- [ ] **Step 1:** Implement `PressableRow` in the file above, following `Button.tsx` for the focus-ring and `titleRef` idiom.
- [ ] **Step 2:** `npm run typecheck`. Expected: exit 0.
- [ ] **Step 3: Commit:** `git commit -am "feat(app): shared PressableRow"` (include the new file with `git add`).

---

### Task 3: Wordmark-only header

**Files:**
- Create: `apps/app/src/headerSubtitle.ts`
- Modify: `apps/app/src/components/HeaderTitle.tsx`, `apps/app/app/_layout.tsx` (the `Stack.Screen` titles)
- Test: `apps/app/src/headerSubtitle.test.ts`

**Interfaces:**
- Produces: `headerSubtitle(routeTitle: string): string | null` returns `routeTitle` for utility pages and `null` otherwise. Utility set: `"Settings"`, `"Lists"`, `"Import & Export"`, `"Recommendations"`, `"My Library"`, `"About"`, `"My Hardcover Account"`.

- [ ] **Step 1: Write the failing tests:** `headerSubtitle("Settings")` is `"Settings"`; `headerSubtitle("Import & Export")` is `"Import & Export"`; `headerSubtitle("Book")`, `("Work")`, `("Author")`, `("Subject")`, `("List")`, `("Explore Graph")`, `("Search")` and `("Shelf Thread")` are `null`.
- [ ] **Step 2: Run** `npm test -w apps/app -- headerSubtitle`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `headerSubtitle` as a `Set` lookup. In `HeaderTitle.tsx`: the wordmark is Fraunces 500 (`fonts.displayMedium`), `typeScale.md` (20px), `colors.ink`, one size; on Home it sits over the tagline "find your next read" as today; elsewhere it is the home link (keep `router.replace("/")`, the `titleRef`, and `accessibilityLabel="Shelf Thread"`); the second line shows `headerSubtitle(children)` only when non-null. Leave the `Stack.Screen` `title` values alone (they still feed the browser tab and back-button labels).
- [ ] **Step 4: Run** `npm test -w apps/app -- headerSubtitle` (PASS), `npm run typecheck` (exit 0).
- [ ] **Step 5: Manual:** web export; open Home, a book, Settings. Wordmark is the same size on all three; only Settings has a second line.
- [ ] **Step 6: Commit:** `git commit -m "feat(app): one wordmark header, subtitle on utility pages only"`

---

### Task 4: My Library as a shelf

**Files:**
- Create: `apps/app/src/listCovers.ts`, `apps/app/src/components/CoverStack.tsx`
- Modify: `apps/app/app/saved.tsx`, `apps/app/src/libraryRows.ts`, `apps/app/src/libraryRows.test.ts`
- Test: `apps/app/src/listCovers.test.ts`

**Interfaces:**
- Consumes: `getLists(): Promise<SavedList[]>` (`storage/savedLists.ts`), `PressableRow` (Task 2), `colors.card` (Task 1), `CoverPlaceholder`.
- Produces: `listCoverUrls(members: ListMember[], max?: number): (string | null)[]`. The first `max` (default 3) members, `https://covers.openlibrary.org/b/isbn/<id>-S.jpg` for `type === "book"`, `null` for works and authors (lists store ids and titles only, so there is no cover to look up). `LIBRARY_ROWS` is split into `LIBRARY_PRIMARY` (Hardcover, Recommendations, Find Connection) and `LIBRARY_TOOLS` (Import & Export, Settings); the "Lists" row is removed from the rows because lists are shown inline; a "See all lists" row routes to `routes.lists()`.

Screen order: Hardcover row (top line, keep the logo) → "Your lists" heading → one card row per list (`CoverStack`, name, count, chevron; opens `routes.list(id)`) → "See all lists" → Recommendations, Find Connection → quiet "Tools" heading → Import & Export, Settings → Footer.

- [ ] **Step 1: Write the failing tests** in `listCovers.test.ts`: three book members give three Open Library URLs in order; a fourth is dropped; a work member and an author member give `null`; an empty list gives `[]`. Update `libraryRows.test.ts` to expect `LIBRARY_PRIMARY` labels `["Hardcover", "Recommendations", "Find Connection"]` and `LIBRARY_TOOLS` labels `["Import & Export", "Settings"]`, keeping the Hardcover-first and unique-ids tests across both.
- [ ] **Step 2: Run** `npm test -w apps/app -- listCovers libraryRows`. Expected: FAIL.
- [ ] **Step 3:** Implement `listCovers.ts` and the `libraryRows.ts` split. `CoverStack({ urls }: { urls: (string | null)[] })` overlaps up to three 28×42 covers with a −10px step (`expo-image`, `contentFit="cover"`, `colors.card` border, shadow here only); a `null` or an empty `urls` renders `CoverPlaceholder`; hidden from assistive tech (the row's label carries the meaning).
- [ ] **Step 4:** Rebuild `saved.tsx` to the order above using `PressableRow`. Load lists with `useFocusEffect(getLists)`; on error show "Couldn't load your lists. Try again." with a Retry pill (the idiom in `lists/index.tsx`). Empty state: "Save a book from its page to start a list."
- [ ] **Step 5: Run** `npm test -w apps/app` and `npm run typecheck`. Expected: green.
- [ ] **Step 6: Manual:** with no lists (empty state, Hardcover and Tools still present), with a list of books, a list of only works.
- [ ] **Step 7: Commit:** `git commit -m "feat(app): My Library shows your lists as a shelf, tools grouped below"`

---

### Task 5: Left-aligned detail top and reordered actions

**Files:**
- Modify: `apps/app/src/components/DetailTop.tsx`, `apps/app/app/book/[isbn].tsx`, `apps/app/app/work/[id].tsx`, `apps/app/app/author/[id].tsx`, `apps/app/app/subject/[slug].tsx`

**Interfaces:**
- Consumes: `useWindowDimensions` width vs `CONTENT_MAX_WIDTH`.
- Produces: `DetailTop` props unchanged (`image`, `title`, `children`, `actions`) plus optional `primaryActions?: ReactNode`. Layout: below 560px wide, stacked and left-aligned (cover, title, byline); at 560px and up, cover beside a text block. `actions` (Share, Save to list) stay in a row under the text; `primaryActions` renders under that.

- [ ] **Step 1:** Update `DetailTop` (`alignItems: "flex-start"`, `textAlign: "left"`, the side-by-side branch at ≥560px).
- [ ] **Step 2:** On book, work and author pages, move **View as Graph** (primary `Button`) into `primaryActions` and make **Find Connection** `variant="pill"` (the outlined secondary) in the same slot, removing the two full-width buttons between About and Format. Both stay hidden without an `openLibraryWorkId` (or the author equivalent). The subject page moves its single View as Graph the same way.
- [ ] **Step 3:** `npm run typecheck` (exit 0).
- [ ] **Step 4: Manual:** at 390px and 1000px wide, on a book with and without a work id: no centred block, no gap where the buttons were absent, graph button is first.
- [ ] **Step 5: Commit:** `git commit -m "feat(app): left-aligned detail top with graph and connection under the title"`

---

### Task 6: External-link rows

**Files:**
- Modify: `apps/app/src/components/FindLinkRow.tsx`, `apps/app/src/components/LibraryFindLinks.tsx`, `apps/app/app/book/[isbn].tsx`, `apps/app/app/work/[id].tsx`

**Interfaces:**
- Consumes: `PressableRow` (Task 2).
- Produces: `FindLinkRow({ label, url })` now renders a `PressableRow` with a trailing `ExternalLink` icon. Book page: the four hand-rolled rows (Open Library, Bookshop, WorldCat, LOC) become `FindLinkRow`s, grouped directly under the call number, with the Hardcover row among them. `LibraryFindLinks` link rows use the same icon; the per-library expander rows keep chevrons (they open in-app disclosure).

- [ ] **Step 1:** Implement; keep each existing `accessibilityLabel` text (e.g. "View on Open Library") and add `accessibilityHint="Opens in your browser"` inside `FindLinkRow`.
- [ ] **Step 2:** `npm run typecheck` (exit 0).
- [ ] **Step 3: Manual:** every Find This Book row opens its URL; no chevron remains on an off-app link; the "Add your library" hint row still routes to Settings.
- [ ] **Step 4: Commit:** `git commit -m "feat(app): external-link icon on off-app rows"`

---

### Task 7: Skeleton loading

**Files:**
- Create: `apps/app/src/components/Skeleton.tsx`
- Modify: `apps/app/app/book/[isbn].tsx`, `apps/app/app/work/[id].tsx`, `apps/app/app/author/[id].tsx`, `apps/app/app/subject/[slug].tsx`

**Interfaces:**
- Produces: `Skeleton({ width, height, style? })`, a `colors.chipBackground` block that pulses (opacity 0.5↔1, 1.2s) unless `AccessibilityInfo.isReduceMotionEnabled()` is true, in which case it is static; `accessibilityElementsHidden`. `DetailSkeleton()` in the same file: a cover block, two title lines and three body lines, wrapped in a `View` with `accessibilityLabel="Loading"` and `accessibilityLiveRegion="polite"`.

- [ ] **Step 1:** Implement both. In the four detail screens replace the large `ActivityIndicator` branch with `<DetailSkeleton />`. Leave small inline spinners (sort, recommendations, search) alone.
- [ ] **Step 2:** `npm run typecheck` (exit 0).
- [ ] **Step 3: Manual:** throttle the network: skeleton shows on first load only; a cached page opens straight to content; an error still shows `ErrorState`; with reduced motion on, the skeleton does not pulse.
- [ ] **Step 4: Commit:** `git commit -m "feat(app): skeleton loading on detail pages"`

---

### Task 8: The thread on Home and as a divider

**Files:**
- Modify: `apps/app/app/index.tsx`, `apps/app/src/components/AccordionSection.tsx` or the detail pages' section style (whichever owns the section divider after the polish merge)

**Interfaces:**
- Consumes: `colors.thread`, existing `node` dot in `index.tsx`.

- [ ] **Step 1 (Home order):** wordmark and tagline are already in the header (Task 3). Order the body: on web, search first then recents (hide the Scan button; scanning needs a camera); on native, Scan as the green button first, then search, then recents. Use `Platform.OS`.
- [ ] **Step 2 (thread):** in "Recently looked at", draw a 1px `colors.thread` line down the centre of the 6px node column joining consecutive nodes (not above the first or below the last), so recents read as a path. The row's bottom rule stays `colors.cardBorder`.
- [ ] **Step 3 (divider):** on detail pages, replace the plain section top rule with a quiet 1px `colors.thread` line at ~40% opacity (single style used by every section).
- [ ] **Step 4:** `npm run typecheck` and `npm test -w apps/app` (green).
- [ ] **Step 5: Manual:** Home with 0, 1 and many recents: no stray line with one; dark theme line is visible but quiet.
- [ ] **Step 6: Commit:** `git commit -m "feat(app): thread through recents and section dividers; platform-aware Home order"`

---

### Task 9: Final check

- [ ] **Step 1:** `npm test`, `npm run typecheck`, `cd apps/app && npx expo export --platform web`. Expected: all pass.
- [ ] **Step 2:** Update the component and screen rows in `docs/CODEBASE.md` (new files: `PressableRow`, `Skeleton`, `CoverStack`, `listCovers`, `headerSubtitle`).
- [ ] **Step 3: Commit:** `git commit -am "docs: CODEBASE rows for the UX refresh Phase B files"`

---

## Self-review

- **Spec coverage:** finding 2 → T3; 3 → T4; 5 → T5; 6 → T5; 7 → T6; 10 → T7; card token → T1; thread + Home order → T8. Findings 1, 4, 8, 9 are Phase A. `PressableRow` (T2) is the "one shared row component" from finding 8, applied to the new screens only; migrating the other 20 Pressables is not in the spec's Phase B list and is left out.
- **Types:** `PressableRow` (T2) is consumed by T4 and T6 with the same props; `card` (T1) by T4 and T5.
- **Proportion:** bodies are left to the implementer; code appears only for test assertions.
