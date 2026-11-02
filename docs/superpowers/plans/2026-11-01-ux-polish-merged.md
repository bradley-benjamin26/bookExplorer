# UX Polish (Merged Reviews) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Shelf Thread feel more inviting and consistent by adding book covers and one thread motif where screens feel empty, cutting the clutter from busy screens, and making the copy consistent.

**Architecture:** Expo Router app in `apps/app`. All styling goes through `useThemedStyles` + tokens in `src/themeColors.ts` / `src/theme.ts`. Reuse existing components (`CoverStack`, `CoverPlaceholder`, `PressableRow`, `AccordionSection`, `ExportButton`, `Button`) before writing new ones. New pure logic goes in a `src/*.ts` file with a sibling `*.test.ts` (vitest).

**Tech Stack:** Expo 57, React Native 0.86 / react-native-web, expo-image, lucide-react-native, vitest.

**Spec:** the "Merged review" section below (this session's frontend-design review and the external review, reconciled).

## Merged review (the spec)

Both reviews agree that the palette and type work. The rest of the app should stay calm. New visual interest comes from **real book covers** and **one thread motif** (the colored nodes joined by a line on Home), not from new UI colors.

Where the reviews disagree:
- **Color.** The external review says not to add a "broader rainbow". This session already gave genre and subject tags the graph's plum and rust, and colored the dots in Home's recently viewed list by kind. **Decision: keep those.** They encode the graph's legend, so they carry meaning. No other hues are added. Ratings are already ochre (`warning`), so nothing changes there.
- **The Home visual.** The external review suggests a cover collage or an illustration. **Decision:** first visit gets the thread illustration (done). Returning visits show each book's cover thumbnail in the recently viewed list (Task 3).

Claims checked and dropped as already done: ochre ratings; non-navigable author rows (they already have no chevron); Import showing a completion message (it does).

Deferred (not in this plan): screenshots or visual examples inside About (needs image assets); tightening the Settings spacing (needs a design pass on device); a native splash screen (`expo-splash-screen` is not installed).

## Global Constraints

- Sentence case for all headings, buttons and route titles. Proper nouns stay capitalized: Shelf Thread, Hardcover, Open Library, WorldCat, LOC, Bookshop.org.
- No new dependencies. No new color tokens except the ones named in Task 1.
- Every new text color must pass `src/theme.test.ts` contrast checks: 4.5:1 for text, 3:1 for non-text, in both light and dark.
- Touch targets ≥44pt. Keep the focus ring (`outlineColor: colors.cover`) on anything pressable.
- Copy names things the way a reader would. No "→" appended to buttons or links. No all-caps labels.
- Run from `apps/app`: `npx tsc --noEmit` and `npx vitest run` must pass before every commit.

## Review Focus

1. Open Library returns a 1×1 transparent image for an ISBN with no cover. A recently viewed book or a list row must still show the placeholder, not an empty box. Fix: render `CoverPlaceholder` *under* the `Image` in `CoverStack` and in the new recently viewed thumbnail (Task 3).
2. A graph with 1–2 nodes must not be magnified past scale 1 when the new controls gutter is applied (Task 7 test `fitScale never exceeds 1`).
3. A manually typed ISBN with hyphens or spaces (`978-0-14-143951-8`) must open the book (Task 6 normalizes through `isValidIsbn` and `normalizeIsbn` from `@book-explorer/shared`).
4. Renaming route titles to sentence case must not drop the header subtitle. `headerSubtitle` matches on the exact title string (Task 10 updates `UTILITY_PAGES` and `headerSubtitle.test.ts` together).
5. In dark mode, the empty-state card and the warmed `thread` color must stay visible against `paper` (Task 1 adds the contrast test rows).

---

### Task 1: Commit the in-tree review changes and warm the thread token

The working tree already holds this session's changes: graph-matched tag colors, the Home intro, colored recently viewed dots, My Library icons and "Hardcover Account", About's down/up chevrons and its typo fix.

**Files:**
- Modify: `apps/app/src/themeColors.ts` (`thread` in both palettes; new `emptyBackground`)
- Test: `apps/app/src/theme.test.ts`

**Interfaces:**
- Produces: `ThemeColors.emptyBackground: string`, the tinted surface for empty-state cards (used in Task 4).

- [ ] **Step 1: Commit the existing working-tree changes as-is**

```bash
git add -A apps/app && git commit -m "feat(app): graph-colored tags and recents, Home intro, Hardcover Account row"
```

- [ ] **Step 2: Add contrast rows to `theme.test.ts`**: `["thread vs paper", c.thread, c.paper, 2]` (decorative line, 2:1 floor), `["ink on emptyBackground", c.ink, c.emptyBackground, 4.5]`, `["inkFaint on emptyBackground", c.inkFaint, c.emptyBackground, 4.5]`.
- [ ] **Step 3: Run `npx vitest run src/theme.test.ts`.** Expected: FAIL (`emptyBackground` undefined).
- [ ] **Step 4: Set tokens.** Light: `thread: "#9A8F7E"`, `emptyBackground: "#F3EDE1"`. Dark: `thread: "#7D7568"`, `emptyBackground: "#24221E"`. Remove the cool `#8A94A8`.
- [ ] **Step 5: Run the tests.** Expected: PASS. If `thread` fails, darken it in 4-unit steps until it passes.
- [ ] **Step 6: Commit** `feat(app): warm the thread color; empty-state surface token`

### Task 2: One-line feedback prompt on Home

**Files:**
- Modify: `apps/app/src/components/FeedbackBanner.tsx`

- [ ] **Step 1: Replace the four-line body** with a single row: the text `Help shape Shelf Thread.`, then a link `Share feedback` (same `Linking.openURL(FEEDBACK_FORM_URL)`, `accessibilityLabel="Share feedback, opens Google Forms"`), then the existing dismiss X. Keep the dismissal storage, the 44pt link height and the left `cover` stripe. Drop `borderWidth` on the other three sides.
- [ ] **Step 2: Verify.** Typecheck and tests pass. At 390px wide in a screenshot, the banner is ≤ 52px tall.
- [ ] **Step 3: Commit** `feat(app): shorten the Home feedback prompt`

### Task 3: Cover thumbnails in recently viewed and in the Lists screen

**Files:**
- Modify: `apps/app/src/listCovers.ts` (add `recentCoverUrl`)
- Test: `apps/app/src/listCovers.test.ts` (create if absent)
- Modify: `apps/app/src/components/CoverStack.tsx` (placeholder under the image)
- Modify: `apps/app/app/index.tsx` (recently viewed row)
- Modify: `apps/app/app/lists/index.tsx` (rows get `CoverStack`, like `app/saved.tsx`)

**Interfaces:**
- Produces: `recentCoverUrl(item: RecentItem): string | null`. Returns `https://covers.openlibrary.org/b/isbn/${id}-S.jpg` for `kind === "book"` and `null` otherwise. It shares the URL builder with `listCoverUrls`; extract `isbnCoverUrl(isbn: string): string` and use it in both.

- [ ] **Step 1: Write tests.** `recentCoverUrl({kind:"book", id:"9780141439518", ...})` equals `"https://covers.openlibrary.org/b/isbn/9780141439518-S.jpg"`. It returns `null` for `work`, `author` and `subject`. The existing `listCoverUrls` behavior is unchanged.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement `isbnCoverUrl` and `recentCoverUrl` in `listCovers.ts`.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Layer `CoverPlaceholder` under each `Image` in `CoverStack`** (absolute fill behind the image), so a transparent 1×1 still shows the placeholder (Review Focus 1).
- [ ] **Step 6: Recently viewed rows on Home.** Between the node column and the text, book items render a 32×48 cover the same way, placeholder underneath with radius `radii.xs`. Non-book items render nothing, so the text stays where it is today. Hide the thumbnail from accessibility.
- [ ] **Step 7: Lists screen rows** (`app/lists/index.tsx`) render `<CoverStack urls={listCoverUrls(list.members)} />` left of the name and count, with the same layout as the `listRow` style in `app/saved.tsx`.
- [ ] **Step 8: Verify.** Typecheck and tests pass. Take a screenshot of Home after visiting one book, and of `/lists` with one list.
- [ ] **Step 9: Commit** `feat(app): covers in recents and on the Lists screen`

### Task 4: Shared `ThreadMotif` and `EmptyState`

**Files:**
- Create: `apps/app/src/components/ThreadMotif.tsx` (moved out of the Home intro in `app/index.tsx`)
- Create: `apps/app/src/components/EmptyState.tsx`
- Modify: `apps/app/app/index.tsx`, `apps/app/app/saved.tsx`, `apps/app/app/lists/index.tsx`, `apps/app/app/lists/[id].tsx`, `apps/app/src/components/RecommendationsSection.tsx`

**Interfaces:**
- Produces: `ThreadMotif({ labelled }: { labelled: boolean })` draws the four graph-colored nodes joined by `thread`, with Book/Author/Subject/Genre labels when `labelled`. It is hidden from accessibility.
- Produces: `EmptyState({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void })` renders a card with `emptyBackground`, `radii.md` and padding `spacing.lg`. Inside: `ThreadMotif labelled={false}`, the message (body, `ink`), then a `Button variant="pill"` when both `actionLabel` and `onAction` are given.

- [ ] **Step 1: Move the intro's node row into `ThreadMotif`.** Home uses `<ThreadMotif labelled />` and looks the same as before (check with a screenshot).
- [ ] **Step 2: Build `EmptyState`.**
- [ ] **Step 3: Replace the italic empty lines** with `EmptyState`, using this copy:
  - My Library, no lists: "Save a book from its page to start a list." Action "Search for a book" goes to `/`.
  - Lists screen, book section: "No book lists yet. Save a book from its page to start one." Action "Search for a book".
  - Lists screen, author section: "No author lists yet. Save an author from their page to start one." No action.
  - Recommendations, `status === "empty"`: "Save a few books or authors and recommendations will appear here." Action "Search for a book".
  - List detail with zero members: "This list is empty. Save a book from its page to add it here." Action "Search for a book".
- [ ] **Step 4: Verify.** Typecheck and tests pass. Take light and dark screenshots of `/saved` and `/lists` with no data.
- [ ] **Step 5: Commit** `feat(app): empty states with the thread motif and a next step`

### Task 5: Search clarity

**Files:**
- Modify: `apps/app/app/search.tsx`

- [ ] **Step 1: Submit on Enter.** On the query input, set `returnKeyType="search"`. Add `onSubmitEditing` that sets the debounced query immediately, skipping the 400ms wait.
- [ ] **Step 2: Visible labels on the filter inputs.** Put a small label above each field: "From year", "To year", "Language". Placeholders become examples: `1990`, `2020`, `eng`. Under Language add the hint "Three-letter code, for example eng or fre", linked to the field with `accessibilityHint`.
- [ ] **Step 3: Verify.** Typecheck and tests pass. Typing a query and pressing Enter shows results without waiting.
- [ ] **Step 4: Commit** `feat(app): search submits on Enter; labelled filters`

### Task 6: Manual ISBN entry on the Scan screen

**Files:**
- Modify: `apps/app/app/scan.tsx`

- [ ] **Step 1: Add an ISBN field** to the permission screen (`!permission.granted`) and under the camera hint. Add a `TextInput` labelled "Or type the ISBN" with `keyboardType="number-pad"` (allow X via `default` on iOS if needed). On submit, if `isValidIsbn(value)` then `router.replace(routes.book(normalizeIsbn(value)))`. Otherwise show inline in `danger`: "That isn't a valid ISBN. Check the 10 or 13 digits on the back cover."
- [ ] **Step 2: Rename the permission button** "Grant Permission" to "Allow camera".
- [ ] **Step 3: Verify.** Typecheck and tests pass. Entering `978-0-14-143951-8` opens Pride and Prejudice (Review Focus 3).
- [ ] **Step 4: Commit** `feat(app): type an ISBN when scanning isn't available`

### Task 7: Graph breathing room and an obvious mode switch

**Files:**
- Modify: `apps/app/src/graphLayout.ts` (add `fitScale`)
- Test: `apps/app/src/graphLayout.test.ts`
- Modify: `apps/app/app/graph/[type]/[id].tsx`

**Interfaces:**
- Produces: `fitScale(viewport: { width: number; height: number }, content: { width: number; height: number }, gutter: number): number` returns `Math.min(1, (viewport.width - 2 * gutter) / content.width, (viewport.height - 2 * gutter) / content.height)`, floored at `MIN_SCALE`. `MIN_SCALE` moves to `graphLayout.ts` if it currently lives in the screen.
- Produces: `CONTROLS_GUTTER = 56` (44pt zoom button + 12 inset).

- [ ] **Step 1: Write tests.** `fitScale({width:390,height:600},{width:800,height:800},56)` is about `0.348`. It returns `1` for content smaller than the viewport. It never returns more than 1 (Review Focus 2) and never less than `MIN_SCALE`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement `fitScale`. In `resetView()`, use `fitScale(..., CONTROLS_GUTTER)`.** Centering is unchanged.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Mode switch.** Replace the single flipping "List"/"Graph" pill with two adjacent pills, "Graph" and "List", using `active` for the current mode. Each has `accessibilityState.selected`. Toolbar order: mode switch, then Filter, then Share.
- [ ] **Step 6: Legend fits one line on phones.** Swatch labels at `typeScale.xs`, row `flexWrap: "wrap"` with `columnGap: spacing.md` and `rowGap: spacing.xs`, aligned left with the explainer text instead of centred.
- [ ] **Step 7: Verify.** Typecheck and tests pass. Take a screenshot of `/graph/work/OL66554W` at 390px: no node sits under the zoom buttons at the initial fit.
- [ ] **Step 8: Commit** `feat(app): graph fits clear of controls; Graph/List switch`

### Task 8: Utility screens

**Files:**
- Modify: `apps/app/app/connection.tsx`, `apps/app/src/components/BackupSection.tsx`, `apps/app/app/lists/[id].tsx`

- [ ] **Step 1: Connection.** Wrap the "how it works" title and explainer (`howTitle` and `explainer`, around lines 106–111) in `<AccordionSection title="How it works">`, closed by default.
- [ ] **Step 2: Import & Export.** Retitle the section heading "Export & Import" to "Import and export your library", to match the page. Make the first help line say what import does: "Importing adds the books and lists from a backup file. Choose whether to merge with or replace what's here."
- [ ] **Step 3: List detail.** Replace the "Export CSV" and "Export JSON" pills with the existing `<ExportButton onChoose={exportList} />`. Group the everyday controls (export, Hardcover sync/copy/unlink) in one row. Keep "Delete list" alone at the bottom, as today.
- [ ] **Step 4: Verify.** Typecheck and tests pass. Take screenshots of `/connection`, `/backup` and a list.
- [ ] **Step 5: Commit** `feat(app): quieter Connection intro, clearer import copy, one Export button on lists`

### Task 9: Detail page action priority and a startup background

**Files:**
- Modify: `apps/app/app/book/[isbn].tsx`, `apps/app/app/work/[id].tsx`, `apps/app/app/author/[id].tsx`, `apps/app/app/subject/[slug].tsx` (the `actions` and `primaryActions` props passed to `DetailTop`)
- Modify: `apps/app/app/_layout.tsx`

- [ ] **Step 1: Regroup the actions.** On every detail page, `primaryActions` holds "View as graph" and "Find connection", both `Button variant="primary"`, side by side with equal height. The user asked for this on 2026-11-01: Find connection should look like View as graph. `actions` holds the pills: Save to list, then Share. This removes the uneven primary-and-pill row. At 390px both primary buttons must fit on one line. If they don't, give each `flexGrow: 1` so they share the row evenly rather than wrapping.
- [ ] **Step 2: Label the subject sort.** Put a "Sort by" label before the subject page's sort pills, in the same row style as the filter labels in Task 5.
- [ ] **Step 3: Startup background.** In `RootLayout`, replace `return null` with a full-screen `View` filled with the system scheme's paper colour (`useColorScheme()`, then `darkColors.paper` or `lightColors.paper`). This avoids a white flash in dark mode. Show no text, because the fonts aren't loaded yet.
- [ ] **Step 4: Verify.** Typecheck and tests pass. Take screenshots of a book page and an author page.
- [ ] **Step 5: Commit** `feat(app): one primary action per detail page; themed startup background`

### Task 10: Sentence-case sweep

**Files:**
- Modify: `apps/app/app/_layout.tsx` (route titles), `apps/app/src/headerSubtitle.ts`, `apps/app/src/libraryRows.ts`, `apps/app/app/about.tsx` (accordion titles), and every screen or component holding a string in the list below
- Test: `apps/app/src/headerSubtitle.test.ts`, `apps/app/src/libraryRows.test.ts`, plus any test that asserts on a renamed string

Renames (old → new):
- "Find This Book" → "Find this book"
- "View as Graph" → "View as graph"
- "Find Connection" → "Find connection"
- "Import & Export" → "Import & export"
- "Explore Graph" → "Explore graph"
- "Scan Barcode" → "Scan barcode"
- "My Hardcover Account" → "My Hardcover account"
- "Hardcover Account" → "Hardcover account"
- "The Homepage" → "The home page"
- "The Graph View" → "The graph view"
- "Works, Books, Authors, and Subjects" → "Works, books, authors and subjects"
- "Setting up the library links" stays as is

- [ ] **Step 1: Find every occurrence** with `grep -rn "<old string>" app src`, one grep per entry above.
- [ ] **Step 2: Update the tests first.** In `headerSubtitle.test.ts`, the renamed titles still return themselves (Review Focus 4). Update the label array in `libraryRows.test.ts`.
- [ ] **Step 3: Run the tests.** Expected: FAIL.
- [ ] **Step 4: Rename the strings and the `UTILITY_PAGES` entries.**
- [ ] **Step 5: Verify.** Run `npx vitest run && npx tsc --noEmit` (PASS). `grep -rn "View as Graph\|Find This Book\|Find Connection\"" app src` returns nothing.
- [ ] **Step 6: Commit** `chore(app): sentence case for headings, buttons and titles`

### Task 11: Saving an edition from a work page lands on that edition's book page

The user asked for this on 2026-11-01. On a work page, Edit (and Save to list) asks which edition to save, then shows the list sheet. After the edition is added to a list, the user must end up on that edition's book page. After Edit it opens in edit mode; after Save to list it opens normally. "Save the work instead" stays on the work page, as today.

Current wiring: `app/work/[id].tsx:77-82` (`onRequestSave` opens the sheet with `editAfterSave`), then `WorkSaveButton` → `AddToListButton.done()` → `onChange` → `saved.current && onSaved(isbn)` → `router.push(routes.book(isbn, { edit }))` (`app/work/[id].tsx:137-141`). The code tries to navigate, so first find the case where it doesn't.

**Files:**
- Modify: `apps/app/src/components/WorkSaveButton.tsx`
- Modify: `apps/app/src/components/AddToListButton.tsx` (only if the cause is there)
- Create: `apps/app/src/workSaveFollow.ts`
- Test: `apps/app/src/workSaveFollow.test.ts`

**Interfaces:**
- Produces: `editionToOpen(pickedIsbn: string | null, listedAfterDone: boolean): string | null`. It returns the ISBN to open, or `null` to stay. It returns non-null only when an edition was picked and that edition is on at least one list after Done.
- Produces: `AddToListButton` gains an optional prop `onClose?: () => void`, called whenever the sheet closes, whether by Done or by dismissing. `WorkSaveButton` runs `editionToOpen` there.

- [ ] **Step 1: Reproduce on web** (`npx expo start --web` plus the server). Open `/work/OL66554W`, tap Edit, pick an edition, tick a list and tap Done. Do it once with Hardcover connected and once without. Write down which case stays on the work page. Check these known suspects in order:
  1. Hardcover reports an issue, so `done()` keeps the sheet open (`if (issue) await load(false)`). `onChange` already fired, so the push happens behind a sheet that stays open over the book page.
  2. The edition was already on the ticked list, so `changes.add` is empty and the sheet treats the tap as "nothing changed".
  3. `saved.current` gets reset between `onSave` and `onChange` by a re-render that calls `open` or `pick`.
- [ ] **Step 2: Write tests for `editionToOpen`.** `("9780141439518", true)` gives `"9780141439518"`. `("9780141439518", false)` gives `null` (Done with every list unticked). `(null, true)` gives `null` (work saved instead).
- [ ] **Step 3: Run them.** Expected: FAIL.
- [ ] **Step 4: Implement `editionToOpen`.** In `WorkSaveButton`, decide on navigation from it rather than `saved.current`. "Listed after Done" means `(await getLists("book")).some(l => l.members.some(m => m.type === "book" && m.id === isbn))`. Call `onSaved` when the sheet *closes*, never while it stays open with a Hardcover message. This fixes suspect 1: the user reads the message, closes the sheet, then lands on the book page.
- [ ] **Step 5: Run them.** Expected: PASS. Repeat Step 1. Every case where an edition ends up on a list lands on `/book/<isbn>`, in edit mode when started from Edit.
- [ ] **Step 6: Commit** `fix(app): saving an edition from a work page opens that edition's book page`

### Task 12: Animate the thread on Home's first visit

The user asked for this on 2026-11-01. It is the app's single orchestrated moment. On the Home intro, the thread draws from Book to Author to Subject to Genre, and each dot appears as the thread reaches it. It plays once per mount, takes 1.6s, then stays still. Empty states (Task 4) stay static. With reduced motion on, the finished drawing shows immediately.

**Files:**
- Create: `apps/app/src/threadReveal.ts`
- Test: `apps/app/src/threadReveal.test.ts`
- Modify: `apps/app/src/components/ThreadMotif.tsx` (from Task 4)
- Modify: `apps/app/app/index.tsx` (pass `animated`)

**Interfaces:**
- Consumes: `ThreadMotif` from Task 4.
- Produces: `nodeReveal(progress: number, index: number, count: number): number`. It returns 0–1 visibility for node `index`. Node 0 shows at progress 0. Node `i` fades in over the 0.08 of progress just before the thread reaches it at `i / (count - 1)`. The function starts with the `"worklet";` directive so Reanimated can call it on the UI thread.
- Produces: `ThreadMotif` gains `animated?: boolean` (default false).

- [ ] **Step 1: Write tests.** `nodeReveal(0, 0, 4)` is `1`. `nodeReveal(0, 1, 4)` is `0`. `nodeReveal(1/3, 1, 4)` is `1`. `nodeReveal(1/3 - 0.04, 1, 4)` is about `0.5`. `nodeReveal(1, 3, 4)` is `1`. The result is always clamped to [0, 1].
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement `nodeReveal`.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Animate `ThreadMotif` when `animated`.** One `useSharedValue(0)` drives everything, run with `withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.cubic) })` on mount. If `useReducedMotion()` is on, it starts at 1 and never animates. The line is an `Animated.View` whose `width` is `${progress * 75}%`, starting at `left: "12.5%"`. Each node is an `Animated.View` with `opacity = nodeReveal(...)` and `scale = 0.6 + 0.4 * nodeReveal(...)`. Use `react-native-reanimated` (already installed). Add no dependency.
- [ ] **Step 6: Home passes `<ThreadMotif labelled animated />`.**
- [ ] **Step 7: Verify.** Typecheck and tests pass. Check on web that the line grows left to right and each dot appears as the line reaches it. Turn on reduced motion (macOS: System Settings → Accessibility → Display → Reduce motion) and reload: the finished drawing appears with no motion.
- [ ] **Step 8: Commit** `feat(app): the Home thread draws itself on first visit`
