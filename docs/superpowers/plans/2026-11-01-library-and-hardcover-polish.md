# Library and Hardcover Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 16 items in `docs/11_01_to-dos.txt`: Hardcover polish (copy popup, logos, progress, "View on Hardcover", Hardcover lists in the save sheet), a header/library/About rework, an Edit/Save link in place of the lock, a CSV/JSON export choice, readable subject labels, and a CSP clean-up.

**Architecture:** All work is in `apps/app` except one small server/shared change for the Hardcover book link (Task 11) and an owner-run Cloudflare/Caddy change (Task 13). Logic goes into small pure modules with vitest tests; screens only wire them in. Two shared components (`CenteredModal`, `HardcoverLogo`, Task 1) are built first because four later tasks use them.

**Tech Stack:** Expo SDK 57 / Expo Router, React Native (web + native), React Query, expo-image, lucide-react-native, Fastify, zod (`@book-explorer/shared`), vitest.

**Spec:** `docs/11_01_to-dos.txt` (items 1–16; each task names its item numbers). There is no separate design doc.

## Prerequisite (owner)

`apps/app/app/about.tsx` (a new Hardcover bullet) and the deletion of `apps/app/about.html` are uncommitted in the main checkout. Commit them to `main` before starting: Task 8 edits `about.tsx`, and a worktree does not see uncommitted files.

## Global Constraints

- Work on a branch in a worktree off `main`, never on `main` itself.
- Expo SDK 57: read https://docs.expo.dev/versions/v57.0.0/ before writing code that touches an Expo API (`apps/app/AGENTS.md`).
- No new dependencies. App tests are vitest on pure logic only; there is no component-test setup and none is added. Screens are verified by typecheck, the web export, and the manual checks written into each task.
- Commands, from the repo root: `npm test -w apps/app -- <pattern>`, `npm test -w apps/server -- <pattern>`, `npm run typecheck`, `cd apps/app && npx expo export --platform web` (CI runs the last two).
- Style: colors, fonts, spacing only from the theme via `useThemedStyles`; one-line why-comments; `titleRef(...)` tooltip on web pressables; every new control has `accessibilityRole` and `accessibilityLabel` and a 44pt target (`hitSlop` where the visual is smaller).
- Subject display rule (item 16): `--` (with or without spaces) and `,` become `->`; a single hyphen is untouched; display only, since stored labels and slugs never change.
- Hardcover logos: only `Hardcover Logo Lightmode.png` (dark text, for the light theme) and `Hardcover Logo Darkmode.png` (white text, for the dark theme), both 512×85, from `/Users/bbradle1/Downloads/Link logos 2/`.
- Never print values from `apps/server/.env`.

## Decisions made where the to-do text was ambiguous

- Items 6 and 11: "Shelf Thread" means the header title (not the feedback banner). The tagline moves into the home header under it.
- Item 3: "along with the ZZgk…" is a stray one-time sign-in code pasted from the clipboard; read as "along with the progress text". The small logo replaces the words "on Hardcover".
- Item 5: the logo becomes the label of the Hardcover row at the top of My Library (the Settings heading it replaces goes away with item 4).
- Item 13: one "Export" button replaces both "Export backup" and "Export CSV", with the choice as JSON backup or CSV.
- Item 14b: tapping a Hardcover list in the sheet imports it as a linked local list and adds the book to it.
- Item 15: the work page has no "Find This Book" section, so it gets one with "View on Open Library" then "View on Hardcover".
- Item 16: the arrows are shown title-cased per segment ("Young Adult Fiction->Historical->Medieval") like every other subject label, not the sentence case in the to-do's example.

## Review Focus

1. **A book or work with no genres and no subjects still has an Edit link** (and an unsaved one still asks to be saved first). Test: Task 9 `editLinkHost`.
2. **A Hardcover list already linked locally never shows twice, and a failed import adds nothing.** Tests: Task 4 `hardcoverChoices`, `importChosenLists`.
3. **Subject headings that are person names** (`Austen, Jane, 1775-1817 -- Criticism`) become arrows too, per the to-do. The test pins this; it is a one-line change if the owner wants names exempt. Test: Task 12.
4. **The copy popup always closes**, on success, error, and rate-limit exhaustion, and never leaves the list screen blocked. Check: Task 2 manual step.
5. **The two-line header with the larger "Shelf Thread" is not clipped or wrapped** on a narrow phone, in iOS/Android native headers, or at the longest title ("My Hardcover Account"). Check: Task 7 manual step.

---

### Task 1: Shared UI pieces: CenteredModal and HardcoverLogo (supports items 1, 3, 5, 13, 14c)

**Files:**
- Create: `apps/app/src/components/CenteredModal.tsx`, `apps/app/src/components/HardcoverLogo.tsx`, `apps/app/src/hardcoverLogo.ts`
- Create (assets): `apps/app/assets/hardcover/hardcover-logo-light.png` (from `Hardcover Logo Lightmode.png`), `apps/app/assets/hardcover/hardcover-logo-dark.png` (from `Hardcover Logo Darkmode.png`)
- Test: `apps/app/src/hardcoverLogo.test.ts`

**Interfaces:**
- Produces:
  - `hardcoverLogoSize(height: number): { width: number; height: number }` where `width = Math.round(height * 512 / 85)`.
  - `<HardcoverLogo height={number} />`: expo-image `Image`, `contentFit="contain"`, the dark asset when `useTheme().scheme === "dark"`, `accessibilityLabel="Hardcover"`.
  - `<CenteredModal visible={boolean} label={string} onClose?={() => void}>{children}</CenteredModal>`: `Modal` with `transparent`, `animationType="fade"`; backdrop `rgba(0,0,0,0.4)` centering a card (`colors.paper`, `radii.md`, `width: "100%"`, `maxWidth: 480`, `maxHeight: "85%"`, margin `spacing.lg`); `accessibilityViewIsModal`; card `accessibilityLabel={label}`. A backdrop tap and the Android back button call `onClose` when given; with no `onClose` the modal cannot be dismissed (back button is a no-op).

- [ ] **Step 1: Write the failing test** in `hardcoverLogo.test.ts`: `hardcoverLogoSize(85)` equals `{ width: 512, height: 85 }`; `hardcoverLogoSize(14)` equals `{ width: 84, height: 14 }`.
- [ ] **Step 2: Run it:** `npm test -w apps/app -- hardcoverLogo`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `hardcoverLogo.ts`, copy the two PNGs with those exact names, and write both components** to the interfaces above (the card styling mirrors the existing modal in `WorkSaveButton.tsx`).
- [ ] **Step 4: Run** `npm test -w apps/app -- hardcoverLogo` (PASS), then `npm run typecheck` (exit 0).
- [ ] **Step 5: Commit:** `git add apps/app/assets/hardcover apps/app/src && git commit -m "feat(app): CenteredModal and HardcoverLogo components"`

---

### Task 2: Loading popup while copying a list to Hardcover (item 1)

**Files:**
- Modify: `apps/app/src/hardcoverLists.ts` (`copyToHardcover`), `apps/app/app/lists/[id].tsx` (`copy`)
- Test: `apps/app/src/hardcoverLists.test.ts`

**Interfaces:**
- Consumes: `CenteredModal` (Task 1).
- Produces: `copyToHardcover(list, onProgress, sleep?, onWait?: (seconds: number) => void)`. `onWait` is called with `retryAfterSeconds ?? 60` before each rate-limit sleep.

- [ ] **Step 1: Write the failing test:** in `hardcoverLists.test.ts`, "calls onWait with the retry delay before sleeping on a 429": the second add rejects with a 429 whose `retryAfterSeconds` is 30; assert `onWait` was called once with `30` and `sleep` with `30_000`.
- [ ] **Step 2: Run it:** `npm test -w apps/app -- hardcoverLists`. Expected: FAIL.
- [ ] **Step 3: Add `onWait` to `copyToHardcover`** (called right before `sleep`). In `lists/[id].tsx`, add `copying` state set true at the start of `copy` and reset in a `finally`, and render a non-dismissable `CenteredModal` (label "Copying to Hardcover") while `copying`: an `ActivityIndicator`, the line "Copying to Hardcover", and `progress || "Starting…"` in an `accessibilityLiveRegion="polite"` text. While waiting on a 429, show "Hardcover asked us to wait N seconds, then we'll continue." in place of the progress line (clear it on the next progress call). Errors and the summary keep appearing in the existing lines under the popup.
- [ ] **Step 4: Run** `npm test -w apps/app -- hardcoverLists` (PASS) and `npm run typecheck`.
- [ ] **Step 5: Manual check (Review Focus 4):** on web, copy a 3-book list: the popup shows "Copying 1 of 3…" and closes at the end with the summary line visible. Turn the network off mid-copy: the popup closes and the error line appears. Neither leaves the screen blocked.
- [ ] **Step 6: Commit:** `git add apps/app/src/hardcoverLists.ts apps/app/src/hardcoverLists.test.ts "apps/app/app/lists/[id].tsx" && git commit -m "feat(app): show a loading popup while copying a list to Hardcover"`

---

### Task 3: Save-to-list sheet: centered, Cancel styled like Done, contrast pinned (items 14a, 14c)

**Files:**
- Modify: `apps/app/src/components/AddToListButton.tsx`, `apps/app/src/theme.test.ts`

**Interfaces:**
- Consumes: `CenteredModal` (Task 1).

- [ ] **Step 1: Write the failing test:** in `theme.test.ts`'s `%s theme contrast` table add `["ink on paper", c.ink, c.paper, 4.5]` and `["cover on paper", c.cover, c.paper, 4.5]` (the sheet's text and link colors; `primaryText on primary` is already pinned at 4.5 and covers both footer buttons).
- [ ] **Step 2: Run it:** `npm test -w apps/app -- theme`. Expected: PASS if the palette already meets 4.5:1; if either row fails, fix the offending color in `themeColors.ts` to the nearest passing value and note it in the commit message.
- [ ] **Step 3: In `AddToListButton.tsx`,** replace the `Modal`/`backdrop`/`sheet` markup with `CenteredModal` (`onClose` closes the sheet; remove the unused `backdrop` and `sheet` styles), and make "Cancel" `variant="primary"` with the same `flex: 1` as "Done" so the two buttons are the same size and style.
- [ ] **Step 4: Run** `npm test -w apps/app -- theme`, `npm run typecheck`.
- [ ] **Step 5: Manual check:** the sheet appears centered with a fade on web and native, both footer buttons match, and it scrolls when the list is long.
- [ ] **Step 6: Commit:** `git add apps/app/src && git commit -m "feat(app): center the save-to-list sheet and style Cancel like Done"`

---

### Task 4: Hardcover lists in the save-to-list sheet (item 14b)

**Files:**
- Create: `apps/app/src/hardcoverChoices.ts`
- Modify: `apps/app/src/hardcoverLists.ts`, `apps/app/src/components/AddToListButton.tsx`
- Test: `apps/app/src/hardcoverChoices.test.ts`, `apps/app/src/hardcoverLists.test.ts`

**Interfaces:**
- Consumes: `fetchHardcoverLists()` and `HardcoverListSummary` (`@book-explorer/shared`), `importList` (`hardcoverLists.ts`), `getSessionToken()`.
- Produces:
  - `hardcoverChoices(remote: HardcoverListSummary[], local: SavedList[]): HardcoverListSummary[]`: the remote lists not linked (`hardcoverListId`) to any list in `local`, in remote order.
  - `importChosenLists(hardcoverListIds: number[]): Promise<string[]>`: runs `importList` one at a time and returns the new local list ids in order; the first failure rethrows (lists already imported stay).

- [ ] **Step 1: Write the failing tests:**
  - `hardcoverChoices.test.ts`: "drops lists already linked to a local list"; "keeps the rest in remote order".
  - `hardcoverLists.test.ts`: "importChosenLists returns the new local list ids in order"; "importChosenLists stops at the first failure and rethrows" (the third list is never requested).
- [ ] **Step 2: Run them:** `npm test -w apps/app -- hardcoverChoices hardcoverLists`. Expected: FAIL.
- [ ] **Step 3: Implement both functions.** In `AddToListButton.tsx`: when `getSessionToken()` is set and `kind === "book"`, `load()` also calls `fetchHardcoverLists()` (a failure leaves the Hardcover rows out, silently) and stores `hardcoverChoices(remote, lists)`. Render them below the local lists as checkbox rows labelled "{name} · on Hardcover" (accessibility label "{name}, a Hardcover list; adds this book and imports the list"), tracked in a `remoteChecked: Set<number>`. In `done()`, run `importChosenLists([...remoteChecked])` first and pass the returned ids as extra `add` ids to `applyListChanges` (`addToList` is a no-op for a book the imported list already holds). Skip the "leaves your library" confirm when `remoteChecked.size > 0`.
- [ ] **Step 4: Run** `npm test -w apps/app -- hardcoverChoices hardcoverLists` (PASS), `npm run typecheck`.
- [ ] **Step 5: Manual check (Review Focus 2):** signed in, open the sheet on a book page: your unimported Hardcover lists appear below your own; tick one, press Done, and the list now exists locally, linked, holding the book (and on Hardcover). Signed out: no Hardcover rows. Reopen the sheet: that list no longer shows as a Hardcover row.
- [ ] **Step 6: Commit:** `git add apps/app/src && git commit -m "feat(app): offer your Hardcover lists in the save-to-list sheet"`

---

### Task 5: Hardcover moves to the top of My Library and shows the logo (items 4, 5)

**Files:**
- Create: `apps/app/src/libraryRows.ts`
- Modify: `apps/app/app/saved.tsx`, `apps/app/app/settings.tsx` (remove the "Hardcover" heading and "My Hardcover Account" button near line 332, plus any style left unused)
- Test: `apps/app/src/libraryRows.test.ts`

**Interfaces:**
- Consumes: `HardcoverLogo` (Task 1), `routes.hardcover()`.
- Produces: `LIBRARY_ROWS: readonly { id: "hardcover" | "lists" | "recommendations" | "connection" | "backup" | "settings"; label: string }[]` in that order, labels "Hardcover", "Lists", "Recommendations", "Find Connection", "Import & Export", "Settings".

- [ ] **Step 1: Write the failing test:** `LIBRARY_ROWS[0].id` is `"hardcover"`; the ids are unique; `LIBRARY_ROWS.map(r => r.label)` equals the six labels above in order.
- [ ] **Step 2: Run it:** `npm test -w apps/app -- libraryRows`. Expected: FAIL.
- [ ] **Step 3: Implement `libraryRows.ts`;** in `saved.tsx` render rows from it, mapping each id to its route, and for `hardcover` render `<HardcoverLogo height={22} />` in place of the label text (row `accessibilityLabel="Hardcover"`). Remove the Hardcover block from `settings.tsx`.
- [ ] **Step 4: Run** `npm test -w apps/app -- libraryRows`, `npm run typecheck`.
- [ ] **Step 5: Manual check:** My Library's first row is the Hardcover wordmark (dark text in the light theme, white text in the dark theme) and opens "My Hardcover Account"; Settings no longer shows a Hardcover section.
- [ ] **Step 6: Commit:** `git add apps/app/src apps/app/app/saved.tsx apps/app/app/settings.tsx && git commit -m "feat(app): put Hardcover first in My Library with its logo"`

---

### Task 6: Reading progress is bigger and carries the small logo (item 3)

**Files:**
- Modify: `apps/app/src/hardcoverProgressLabel.ts`, `apps/app/src/components/HardcoverProgress.tsx`
- Test: `apps/app/src/hardcoverProgressLabel.test.ts`

**Interfaces:**
- Consumes: `HardcoverLogo` (Task 1), `progressLabel(p)`.
- Produces: `progressSpokenLabel(label: string): string` returns `` `${label} on Hardcover` ``.

- [ ] **Step 1: Write the failing test:** `progressSpokenLabel("Reading · 40%")` equals `"Reading · 40% on Hardcover"`.
- [ ] **Step 2: Run it:** `npm test -w apps/app -- hardcoverProgressLabel`. Expected: FAIL.
- [ ] **Step 3: Implement.** `HardcoverProgress` renders one row: the label in `fonts.bodySemiBold`, `typeScale.sm`, `colors.ink` (was `inkFaint`, `xs`), then `<HardcoverLogo height={14} />` (hidden from assistive tech with `accessibilityElementsHidden`); the row carries `accessibilityRole="text"` and `accessibilityLabel={progressSpokenLabel(label)}`. The visible words "on Hardcover" go away.
- [ ] **Step 4: Run** `npm test -w apps/app -- hardcoverProgressLabel`, `npm run typecheck`.
- [ ] **Step 5: Commit:** `git add apps/app/src && git commit -m "feat(app): make Hardcover reading progress larger with a small logo"`

---

### Task 7: Header: "?" About button, tagline under the home title, same-size title everywhere (items 6, 7, 8, 11)

**Files:**
- Create: `apps/app/src/components/AboutButton.tsx`
- Modify: `apps/app/src/components/HeaderTitle.tsx`, `apps/app/src/components/HeaderActions.tsx`, `apps/app/app/_layout.tsx`, `apps/app/app/index.tsx`

**Interfaces:**
- Produces:
  - `<AboutButton />`: a small help icon (lucide `CircleHelp`, or `HelpCircle` in older versions; use whichever the installed package exports), size 16, 44pt target like `MyLibraryButton`, `accessibilityLabel="About Shelf Thread"`, goes to `routes.about()`.
  - `HeaderActions({ show }: { show?: ("about" | "library" | "search")[] })`, default all three, rendered in that order (so "?" sits just left of the library icon).
  - `HeaderTitle`: home (`children === "Shelf Thread"`) is the large title with the line "find your next read" (`typeScale.xs`, `colors.inkFaint`) beneath it. Every other screen shows the same large "Shelf Thread" (`fonts.display`, `typeScale.lg`, `colors.cover`, still the link home) above the page title (`typeScale.sm`).

- [ ] **Step 1: Implement** the components above. In `_layout.tsx`: home `headerRight` is `<HeaderActions show={["about", "library"]} />`; the `saved` screen uses `show={["about", "search"]}`; the `about` screen uses `show={["library", "search"]}`; every other screen keeps the default.
- [ ] **Step 2: In `index.tsx`,** delete the `header` block (the tagline now lives in `HeaderTitle`, and the "About Shelf Thread" link is removed) and its `subtitle`, `aboutLink`, `header` styles and now-unused imports; give `scanButton` a `marginTop: spacing.md`.
- [ ] **Step 3: Run** `npm run typecheck` and `cd apps/app && npx expo export --platform web` (both succeed).
- [ ] **Step 4: Manual check (Review Focus 5):** at 360px width and on an iOS and an Android device, on the home page and the longest-titled screen ("My Hardcover Account"): the two-line header is not clipped or wrapped, "find your next read" sits directly under "Shelf Thread", the "?" opens About from the home, My Library and detail screens, and no "About Shelf Thread" link remains on the home page. If a native header clips the taller title, report it back instead of shrinking the title.
- [ ] **Step 5: Commit:** `git add apps/app/src apps/app/app && git commit -m "feat(app): About button, tagline in the home header, same-size Shelf Thread everywhere"`

---

### Task 8: About page sections become accordions (item 12)

**Files:**
- Create: `apps/app/src/components/AccordionSection.tsx`
- Modify: `apps/app/app/about.tsx`

**Interfaces:**
- Produces: `<AccordionSection title={string}>{children}</AccordionSection>`: a header row (`Pressable`, `accessibilityRole="button"`, `accessibilityState={{ expanded }}`, `titleRef(title)`) with the title in `fonts.displayMedium` / `typeScale.md` and a chevron (`ChevronRight` collapsed, `ChevronDown` open), a hairline `colors.border` under it, and the children only when open. Each section keeps its own open state; all start closed.

- [ ] **Step 1: Implement `AccordionSection`** to the interface above.
- [ ] **Step 2: In `about.tsx`** (starting from the committed version that already has the Hardcover bullet), replace each `<Heading>` plus the content under it with an `<AccordionSection title="…">`: "What is it?", "The Homepage", "The Graph View", "My Library", "Works, Books, Authors, and Subject", "Setting up the library links". Keep the page `Title`. In "My Library", change "five" to "six" if the text counts the sections, and fix any mention of the lock icon (see Task 9) or of the home-page About link.
- [ ] **Step 3: Run** `npm run typecheck` and `cd apps/app && npx expo export --platform web`.
- [ ] **Step 4: Manual check:** all six headings show collapsed; each opens and closes independently; Tab reaches each header, Enter/Space toggles it, and a screen reader announces collapsed or expanded.
- [ ] **Step 5: Commit:** `git add apps/app/src apps/app/app/about.tsx && git commit -m "feat(app): make About sections accordions"`

---

### Task 9: Edit/Save link replaces the lock icon (items 9, 10)

**Files:**
- Create: `apps/app/src/termsEditHost.ts`
- Modify: `apps/app/src/components/TermsSection.tsx` (remove `LockButton` and the Lock icons and the `lockButton` style), `apps/app/app/book/[isbn].tsx`, `apps/app/app/work/[id].tsx`
- Test: `apps/app/src/termsEditHost.test.ts`

**Interfaces:**
- Consumes: `useEditLock` (unchanged: `toggle` still opens the editor, or asks to save an unsaved item first, and saves the draft when it closes).
- Produces:
  - `editLinkHost(genres: string[], subjects: string[], unlocked: boolean): "genres" | "subjects" | "standalone"`: `"genres"` when `unlocked` or `genres.length > 0`; else `"subjects"` when `subjects.length > 0`; else `"standalone"`.
  - `type EditLink = { label: "Edit" | "Save"; onPress: () => void }`; `TermsSection` takes `editLink?: EditLink` and shows it right-aligned on its title line (title left, link right).
  - `<EditLinkRow editLink={EditLink} />`: a right-aligned row for the `standalone` case, rendered where the Genres section would be.
  - The link is `fonts.bodySemiBold`, `colors.cover`, underlined, with `accessibilityLabel` "Edit genres, subjects and notes" or "Save your edits".

- [ ] **Step 1: Write the failing tests** in `termsEditHost.test.ts`: genres present gives `"genres"`; no genres but subjects gives `"subjects"`; neither gives `"standalone"`; neither but `unlocked` gives `"genres"`.
- [ ] **Step 2: Run them:** `npm test -w apps/app -- termsEditHost`. Expected: FAIL.
- [ ] **Step 3: Implement** `termsEditHost.ts`, the `TermsSection` prop, and `EditLinkRow`. On both pages remove `<LockButton …/>` from the `DetailTop` actions, compute the host from the displayed genre and subject labels, build `{ label: lock.unlocked ? "Save" : "Edit", onPress: lock.toggle }`, and pass it only to the chosen section (or render `EditLinkRow`).
- [ ] **Step 4: Update `useEditLock`'s doc comment and `about.tsx` wording** that still say "lock" or "unlock" (grep `-i lock` in `apps/app`).
- [ ] **Step 5: Run** `npm test -w apps/app -- termsEditHost`, `npm run typecheck`.
- [ ] **Step 6: Manual check (Review Focus 1):** on a saved book with genres, "Edit" sits opposite "Genres"; pressing it shows "Save" and the chips become editable (× and the add fields); "Save" saves and the link returns to "Edit". On a book with no genres, the link sits opposite "Subjects". On one with neither, a right-aligned "Edit" row still appears. On an unsaved book, "Edit" opens the save sheet with the existing notice. No lock icon remains on either page.
- [ ] **Step 7: Commit:** `git add apps/app/src apps/app/app && git commit -m "feat(app): replace the lock icon with an Edit/Save link"`

---

### Task 10: One Export button that offers JSON or CSV (item 13)

**Files:**
- Create: `apps/app/src/exportFormats.ts`, `apps/app/src/components/ExportButton.tsx`
- Modify: `apps/app/src/components/BackupSection.tsx`
- Test: `apps/app/src/exportFormats.test.ts`

**Interfaces:**
- Consumes: `CenteredModal` (Task 1), `exportJson`, `exportCsv`, `shareFile`.
- Produces:
  - `type ExportFormat = "json" | "csv"`.
  - `exportFileInfo(format: ExportFormat, day: string): { name: string; mime: string }`: JSON gives `book-explorer-${day}.json` / `application/json`; CSV gives `book-explorer-books-${day}.csv` / `text/csv`.
  - `<ExportButton onChoose={(f: ExportFormat) => void} />`: a pill "Export" (`accessibilityLabel="Export your library"`) that opens a dismissable `CenteredModal` titled "Export as" with two buttons: "JSON backup" (help text "Everything: books, authors, notes, lists and libraries") and "CSV" (help text "Books only, for Goodreads or StoryGraph"). A choice closes the modal and calls `onChoose`.

- [ ] **Step 1: Write the failing tests** in `exportFormats.test.ts`: `exportFileInfo("json", "2026-11-01")` equals `{ name: "book-explorer-2026-11-01.json", mime: "application/json" }`; `exportFileInfo("csv", "2026-11-01")` equals `{ name: "book-explorer-books-2026-11-01.csv", mime: "text/csv" }`.
- [ ] **Step 2: Run them:** `npm test -w apps/app -- exportFormats`. Expected: FAIL.
- [ ] **Step 3: Implement** both files. In `BackupSection`, remove the "Export backup" and "Export CSV" buttons and add `<ExportButton onChoose={…} />` whose handler runs, inside the existing `attempt`, `shareFile(name, format === "json" ? await exportJson() : await exportCsv(workIsbn), mime)` with `exportFileInfo(format, today())`. Leave the list screen's export buttons as they are.
- [ ] **Step 4: Run** `npm test -w apps/app -- exportFormats`, `npm run typecheck`.
- [ ] **Step 5: Manual check:** Import & Export shows one "Export" button; it offers JSON backup or CSV and downloads the same files as before.
- [ ] **Step 6: Commit:** `git add apps/app/src && git commit -m "feat(app): one Export button that offers JSON or CSV"`

---

### Task 11: "View on Hardcover" on book and work pages (item 15)

**Files:**
- Create: `apps/app/src/findLinks.ts`, `apps/app/src/components/FindLinkRow.tsx`
- Modify: `apps/server/src/sources/hardcover.ts` (query + result), `apps/server/src/services/bookService.ts`, `apps/server/src/services/workService.ts`, `packages/shared/src/index.ts` (Book and Work schemas), `apps/app/app/book/[isbn].tsx`, `apps/app/app/work/[id].tsx`
- Test: `apps/app/src/findLinks.test.ts`, `apps/server/src/sources/hardcover.test.ts`, `apps/server/src/services/bookService.test.ts`

**Interfaces:**
- Produces:
  - `HardcoverBookData.slug: string | null` (the Hardcover book's `slug`), and `hardcoverSlug: z.string().nullable().optional()` on the shared `BookSchema` and `WorkSchema` (optional so cached pages from before this change still load).
  - `hardcoverUrl(slug: string | null | undefined, query: string): string`: `https://hardcover.app/books/${encodeURIComponent(slug)}` when there is a slug, else `https://hardcover.app/search?q=${encodeURIComponent(query)}`.
  - `openLibraryWorkUrl(workId: string): string`: `https://openlibrary.org/works/${workId}`.
  - `<FindLinkRow label={string} url={string} />`: the same row look as the book page's existing "Find This Book" rows (label in `colors.cover`, chevron), opening `url` with `Linking.openURL`, `accessibilityLabel={label}`.

- [ ] **Step 1: Confirm the field live** (read-only): with `HARDCOVER_API_KEY` from `apps/server/.env` (never printed), run a GraphQL query `editions(where: {isbn_13: {_eq: "9780441013593"}}, limit: 1) { book { slug } }` against `https://api.hardcover.app/v1/graphql`. Expected: a non-empty string slug. If the field has another name, use that name throughout.
- [ ] **Step 2: Write the failing tests:**
  - `findLinks.test.ts`: `hardcoverUrl("dune", "x")` equals `https://hardcover.app/books/dune`; `hardcoverUrl(null, "9780441013593")` equals `https://hardcover.app/search?q=9780441013593`; `hardcoverUrl(undefined, "a b")` equals `https://hardcover.app/search?q=a%20b`; `openLibraryWorkUrl("OL45883W")` equals `https://openlibrary.org/works/OL45883W`.
  - `hardcover.test.ts`: "lookupByIsbn returns the book's slug" (mocked response carries `slug: "dune"`; absent slug gives `null`).
  - `bookService.test.ts`: the book result carries `hardcoverSlug` from the Hardcover data (and `null` when Hardcover has none).
- [ ] **Step 3: Run them:** `npm test -w apps/app -- findLinks`, `npm test -w apps/server -- hardcover bookService`. Expected: FAIL.
- [ ] **Step 4: Implement** the query/result change, the service and schema fields (work results get the same field from the same Hardcover lookup), `findLinks.ts`, and `FindLinkRow`. Book page: add `<FindLinkRow label="View on Hardcover" url={hardcoverUrl(data.hardcoverSlug, data.isbn)} />` directly after the "View on Open Library" row. Work page: add a "Find This Book" section (same section style as the book page) before the reviews, with `View on Open Library` (`openLibraryWorkUrl`) then `View on Hardcover` (`hardcoverUrl(data.hardcoverSlug, data.title)`). The link shows for signed-out visitors too.
- [ ] **Step 5: Run** the three commands from step 3 (PASS), then `npm test -w apps/server`, `npm test -w apps/app`, `npm run typecheck`.
- [ ] **Step 6: Manual check:** a book page and a work page each show "View on Hardcover" under Open Library; it opens the book's Hardcover page (or a Hardcover search when the slug is missing). Confirm the search URL opens a results page in a browser.
- [ ] **Step 7: Commit:** `git add apps/app/src apps/server/src packages/shared/src "apps/app/app/book/[isbn].tsx" "apps/app/app/work/[id].tsx" && git commit -m "feat: View on Hardcover on book and work pages"`

---

### Task 12: Subject labels show `->` between parts (item 16)

**Files:**
- Create: `apps/app/src/subjectLabel.ts`
- Modify: `apps/app/src/navigation.ts` (`routes.subject`), `apps/app/src/components/TermsSection.tsx`, `apps/app/app/subject/[slug].tsx`, `apps/app/src/graphLayout.ts` (line ~247)
- Test: `apps/app/src/subjectLabel.test.ts`, `apps/app/src/navigation.test.ts`, `apps/app/src/graphLayout.test.ts`

**Interfaces:**
- Consumes: `titleCase`, `slugifySubject` (`@book-explorer/shared`).
- Produces:
  - `subjectLabel(label: string): string`: split on `/\s*--\s*|\s*,\s*/`, drop empty parts, `titleCase` each, join with `->`.
  - `subjectSpokenLabel(label: string): string`: the same parts joined with `", "` (screen readers read `->` badly).
  - `subjectDisplayName(slug: string, serverName: string, label?: string): string`: `label` when `slugifySubject(label) === slug`, else `serverName`.
  - `routes.subject(slug: string, label?: string)`: adds `?label=` when given.

- [ ] **Step 1: Write the failing tests** in `subjectLabel.test.ts`:
  - `subjectLabel("Young adult fiction -- Historical -- Medieval")` equals `"Young Adult Fiction->Historical->Medieval"`.
  - `subjectLabel("Science fiction--Authorship")` equals `"Science Fiction->Authorship"`.
  - `subjectLabel("Fiction, Historical")` equals `"Fiction->Historical"`.
  - `subjectLabel("Coming-of-age")` equals `"Coming-of-Age"` (a single hyphen stays).
  - `subjectLabel("science fiction")` equals `"Science Fiction"`.
  - `subjectLabel("Fiction -- ")` equals `"Fiction"`.
  - Pin per Review Focus 3: `subjectLabel("Austen, Jane, 1775-1817 -- Criticism")` equals `"Austen->Jane->1775-1817->Criticism"`.
  - `subjectSpokenLabel("Fiction -- Historical")` equals `"Fiction, Historical"`.
  - `subjectDisplayName("young_adult_fiction_historical_medieval", "young adult fiction historical medieval", "Young adult fiction, Historical, Medieval")` returns the label; with a label for a different slug, or none, it returns the server name.
  - In `navigation.test.ts`: `routes.subject("a_b", "A, B")` includes `label=A%2C%20B`; `routes.subject("a_b")` has no `label`.
  - In `graphLayout.test.ts`: a `subject` node with label `"Fiction -- Historical"` is shown as `"Fiction->Historical"`, while a `genre` node keeps plain title-casing.
- [ ] **Step 2: Run them:** `npm test -w apps/app -- subjectLabel navigation graphLayout`. Expected: FAIL.
- [ ] **Step 3: Implement** the helpers and the route param. Apply `subjectLabel` (and `subjectSpokenLabel` for `accessibilityLabel`s and `titleRef` tooltips) to: subject chips in `TermsSection` (subjects only; genres and awards keep `titleCase`), which now pass the chip's label to `routes.subject`; the subject page title, share title, recent-history title and related-topic chips (which also pass their label), using `subjectDisplayName(slug, data.name, label)` for the page's own name; and `subject` nodes in `graphLayout.ts` (genre nodes unchanged).
- [ ] **Step 4: Run** `npm test -w apps/app -- subjectLabel navigation graphLayout` (PASS), `npm test -w apps/app`, `npm run typecheck`.
- [ ] **Step 5: Manual check:** on a book whose subjects include a compound heading, the chip reads with `->` between its parts; tapping it opens the subject page titled with the same `->` form; the subject graph and the related-topics chips match. Opening `/subject/young_adult_fiction_historical_medieval` directly shows the server's name without arrows (neither Open Library nor the Library of Congress carries separators for that slug, so a direct link has no source for them); reaching it from a chip shows the arrows.
- [ ] **Step 6: Commit:** `git add apps/app/src apps/app/app && git commit -m "feat(app): show subject headings with -> between parts"`

---

### Task 13: Clear the Content-Security-Policy console messages (item 2): the owner runs this on the droplet

The messages are from a **report-only** policy (`script-src 'unsafe-inline' 'unsafe-eval'`, `connect-src 'none'`). It is not in this repo, so it is added by Caddy or a Cloudflare rule. Nothing is blocked today; the policy has no `'self'`, so every script and request is reported. The executor stops here and asks the owner to do each step, then waits for "done".

**Files:**
- Create: `docs/deploy-csp.md` (the final policy, where it is set, and how it was checked)

- [ ] **Step 1: Find where the header is set.** On the droplet: `curl -sk -I -H "Host: shelfthread.com" https://localhost/ | grep -i content-security` and `grep -rn -i "content-security" /etc/caddy`. If the origin sends nothing, it comes from Cloudflare: Rules → Transform Rules → Modify Response Header.
- [ ] **Step 2: Replace the policy** with this report-only one (keep it report-only; enforcing is a separate decision):

  ```
  default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.shelfthread.com https://cloudflareinsights.com; frame-src 'self'; object-src 'none'; base-uri 'self'
  ```

  The Cloudflare lines cover its `cdn-cgi` scripts and the Web Analytics beacon; if Web Analytics is not wanted, switch off its automatic setup in Cloudflare and drop the two `cloudflareinsights` entries.
- [ ] **Step 3: Reload** (`sudo systemctl reload caddy`, or save the rule) and open https://shelfthread.com with the browser console open: the book/search pages and the Hardcover sign-in return page (`/hardcover-connected`) show no violation lines. Any remaining line names a source to add.
- [ ] **Step 4: Write `docs/deploy-csp.md`** with the final policy, where it is set, and the check, then commit: `git add docs/deploy-csp.md && git commit -m "docs: record the Content-Security-Policy"`

---

## Self-review notes

- **Coverage:** items 1→T2, 2→T13, 3→T6, 4/5→T5, 6/7/8/11→T7, 9/10→T9, 12→T8, 13→T10, 14a/14c→T3, 14b→T4, 15→T11, 16→T12. Supporting components in T1.
- **Names checked across tasks:** `CenteredModal` and `HardcoverLogo` (T1) are consumed by T2, T3, T5, T6, T10 with the same props; `hardcoverLogoSize`, `editLinkHost`, `exportFileInfo`, `subjectLabel`, `hardcoverUrl` are each defined once.
- **Order:** T1 first; T8 needs the Prerequisite; the rest are independent and can run in numbered order.
