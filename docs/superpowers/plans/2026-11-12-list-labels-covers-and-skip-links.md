# List Labels, Covers, Skip Links and Hardcover Footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clearer unlink buttons, covers on list rows, skip links past the long lists on work pages, and a Hardcover credit link in the footer.

**Architecture:** All app-side, no server change and no new dependency. The unlink text and the cover lookup become small pure functions so vitest can cover them; the screens only call them. The skip link is one small web-only component plus a `skipTo(id)` helper that focuses a zero-height target placed right after the list.

**Tech Stack:** Expo Router app (React Native Web), React Query, vitest (pure `.ts` tests only; the app has no component tests, so UI wiring is checked by typecheck and a manual web run).

**Spec:** the request in the 2026-11-12 conversation (not saved to a file). Five items: (1) "Unlink" becomes "Unlink Hardcover" / "Unlink Open Library" (the "Update …" rename was dropped at review: sync and copy buttons keep their current text); (2) covers on lists and saved books; (3) a skip link on work pages past the Series list and past the Editions list; (4) a skip link past "More by this author"; (5) a footer link "Enhanced with APIs from Hardcover" to `https://hardcover.app/?referrer_id=173231`.

**Decisions confirmed at review:**
- "The whole list" on work pages means the **Series list** and the **Editions list** ("Find Your Edition"). "More by this author" is a third skip link.
- No "Update …" feature. "Sync with …" and "Copy to …" are unchanged; only the unlink buttons are renamed.
- "Lists and saved books" means the rows on the list detail page (`/lists/[id]`) plus the cover stacks on `/saved` and `/lists`, which today show nothing for works.

## Global Constraints

- No new dependencies.
- Exact copy: `Unlink Hardcover`, `Unlink Open Library`, `Enhanced with APIs from Hardcover`.
- Exact URL: `https://hardcover.app/?referrer_id=173231`.
- An accessible name must contain the visible text (label-in-name): the unlink button's `accessibilityLabel` equals its visible text.
- Covers in list rows are decorative (null alt; the row names the book), the way `CoverStack` already does it.
- Skip links render on web only and are visually hidden until focused.
- House style: comments state the why in one line; mark limits with `// shortcut: <limit>, <when to upgrade>`; every new module ships with its `*.test.ts`.

## Review Focus

1. **List linked to only one service.** Only that service shows "Unlink …"; the other keeps "Copy to …". (Task 2, manual check.)
2. **A work with no series, no editions or no "more by" works.** No skip link renders, and pressing a skip link whose target is missing does nothing rather than throw. (Task 4 test.)
3. **A work on a list that was never opened.** It has no cached cover, so the row shows the placeholder, not a broken image. (Task 3 test.)
4. **An ISBN Open Library has no cover for.** It serves a transparent 1x1 image; `CoverStack` already draws a placeholder under it. No change; confirm in the manual run.
5. **Native builds.** The skip link and target render nothing off web. (Task 4, manual check by reading the `Platform.OS` guard.)

---

## File Structure

- Create `apps/app/src/listActions.ts` (+ `.test.ts`): `Service` type, `unlinkLabel`.
- Create `apps/app/src/skipLink.ts` (+ `.test.ts`): `skipTo`.
- Create `apps/app/src/components/SkipLink.tsx`: `SkipLink` and `SkipTarget`.
- Modify `apps/app/src/listCovers.ts` (+ test), `apps/app/src/findLinks.ts` (+ `findLinks.test.ts`).
- Modify `apps/app/src/components/Footer.tsx`, `WorkListSections.tsx`, `EditionsSection.tsx`.
- Modify `apps/app/app/lists/[id].tsx`, `apps/app/app/lists/index.tsx`, `apps/app/app/saved.tsx`.
- Modify `docs/CODEBASE.md`.

Commands run from `apps/app`.

---

### Task 1: Footer credit link

**Files:**
- Modify: `apps/app/src/findLinks.ts`, `apps/app/src/components/Footer.tsx`
- Test: `apps/app/src/findLinks.test.ts`

**Interfaces:**
- Produces: `HARDCOVER_REFERRAL_URL: string` exported from `src/findLinks.ts`.

- [ ] **Step 1: Write the failing test** in `findLinks.test.ts`: `it("links Hardcover with the referral id")` asserting `HARDCOVER_REFERRAL_URL === "https://hardcover.app/?referrer_id=173231"`.
- [ ] **Step 2: Run it.** `npx vitest run src/findLinks.test.ts` → FAIL (export missing).
- [ ] **Step 3: Add `export const HARDCOVER_REFERRAL_URL`** next to `hardcoverUrl` in `findLinks.ts`.
- [ ] **Step 4: Run it.** Same command → PASS.
- [ ] **Step 5: Add the link to `Footer`.** A `Pressable` with `accessibilityRole="link"`, `titleRef("Visit Hardcover")`, `onPress={() => Linking.openURL(HARDCOVER_REFERRAL_URL)}`, text `Enhanced with APIs from Hardcover`, styled with `styles.text`. Put it directly under the "Built using Open Library APIs" link, before "Share feedback".
- [ ] **Step 6: Commit.** `git add apps/app/src && git commit -m "feat(app): footer credits Hardcover with the referral link"`

---

### Task 2: Unlink button labels

**Files:**
- Create: `apps/app/src/listActions.ts`, `apps/app/src/listActions.test.ts`
- Modify: `apps/app/app/lists/[id].tsx` (`Service` type at line 31; `syncButtons` at about line 163)

**Interfaces:**
- Produces: `type Service = "Hardcover" | "Open Library"`; `unlinkLabel(service: Service): string`.

- [ ] **Step 1: Write the failing tests** in `listActions.test.ts`: `unlinkLabel("Hardcover")` → `"Unlink Hardcover"`; `unlinkLabel("Open Library")` → `"Unlink Open Library"`.
- [ ] **Step 2: Run them.** `npx vitest run src/listActions.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement `Service` and `unlinkLabel`** in `listActions.ts`.
- [ ] **Step 4: Run them** → PASS.
- [ ] **Step 5: Wire `lists/[id].tsx`.** Import `Service` and `unlinkLabel`, and delete the local `Service` type. In `syncButtons`' linked branch, the unlink button's text and `accessibilityLabel` both become `unlinkLabel(service)`. Everything else is unchanged: "Sync with …", "Syncing…", "Copy to …" and the confirm dialog copy.
- [ ] **Step 6: Typecheck.** `npm run typecheck` → no errors.
- [ ] **Step 7: Commit.** `git commit -m "feat(app): Unlink buttons name their service"`

---

### Task 3: Covers on list rows and cover stacks

**Files:**
- Modify: `apps/app/src/listCovers.ts`, `apps/app/src/listCovers.test.ts`, `apps/app/app/lists/[id].tsx`, `apps/app/app/lists/index.tsx`, `apps/app/app/saved.tsx`

**Interfaces:**
- Consumes: `CoverStack({ urls: (string | null)[] })` (unchanged).
- Produces: `smallCover(url: string): string` (swaps Open Library `-M`/`-L` for `-S`, leaves other URLs alone; `recentCoverUrl` uses it instead of its inline copy); `memberCoverUrl(m: ListMember, workCover?: (id: string) => string | null): string | null`; `listCoverUrls(members, max = 3, workCover?)` now passes `workCover` through.

Behaviour: book → `isbnCoverUrl(m.id)`; work → `smallCover(workCover(m.id))` when the lookup returns a URL, else `null`; author → `null`.

- [ ] **Step 1: Write the failing tests** in `listCovers.test.ts`:
  - `memberCoverUrl` for a work with `workCover = () => "https://covers.openlibrary.org/b/id/9-M.jpg"` → `".../9-S.jpg"`.
  - Same work with no lookup passed → `null` (Review Focus 3).
  - Same work with a lookup returning `null` → `null`.
  - Book → the ISBN cover URL; author → `null`.
  - `listCoverUrls([work], 3, lookup)` uses the lookup.
  - Update the existing test "gives null for works and authors": it still holds when no lookup is passed.
- [ ] **Step 2: Run them.** `npx vitest run src/listCovers.test.ts` → FAIL.
- [ ] **Step 3: Implement** the three functions in `listCovers.ts`; keep the existing test for `recentCoverUrl` passing.
- [ ] **Step 4: Run them** → PASS.
- [ ] **Step 5: Wire the screens.** In each of the three screens, `const queryClient = useQueryClient()` and `const workCover = (id: string) => queryClient.getQueryData<Work>(["work", id])?.coverUrl ?? null`; pass it as the third argument to `listCoverUrls` in `saved.tsx` and `lists/index.tsx`. Add `// shortcut: reads the work cache at render, so a cover that hydrates later shows on the next focus; upgrade if that is noticed.` once.
- [ ] **Step 6: Add a cover to each row in `lists/[id].tsx`.** Inside the `rowMain` `Pressable`, before the title `Text`, render `<CoverStack urls={[memberCoverUrl(member, workCover)]} />` and give `rowMain` `flexDirection: "row"`, `alignItems: "center"`, `gap: spacing.md`. The row's `accessibilityLabel` stays the title.
- [ ] **Step 7: Typecheck and run all tests.** `npm run typecheck && npm test` → pass.
- [ ] **Step 8: Commit.** `git commit -m "feat(app): covers on list rows, and on work members in cover stacks"`

---

### Task 4: Skip links past Series, Editions and More by this author

**Files:**
- Create: `apps/app/src/skipLink.ts`, `apps/app/src/skipLink.test.ts`, `apps/app/src/components/SkipLink.tsx`
- Modify: `apps/app/src/components/WorkListSections.tsx`, `apps/app/src/components/EditionsSection.tsx`

**Interfaces:**
- Produces: `skipTo(id: string, doc?: { getElementById(id: string): { focus(): void } | null }): boolean` (defaults to the global `document`; returns whether it focused anything); `SkipLink({ label, targetId })`; `SkipTarget({ id })`.

- [ ] **Step 1: Write the failing tests** in `skipLink.test.ts` with a fake `doc`:
  - Target found → `focus` called once and returns `true`.
  - Target missing (`getElementById` returns `null`) → returns `false`, no throw (Review Focus 2).
- [ ] **Step 2: Run them.** `npx vitest run src/skipLink.test.ts` → FAIL.
- [ ] **Step 3: Implement `skipTo`.**
- [ ] **Step 4: Run them** → PASS.
- [ ] **Step 5: Build `SkipLink.tsx`.**
  - Both components return `null` unless `Platform.OS === "web"` (Review Focus 5).
  - `SkipLink` is a `Pressable` with `accessibilityRole="link"` and the `label` text, calling `skipTo(targetId)`. It is moved off screen until it has focus (`onFocus` / `onBlur` toggle state), then shows as a small pill using theme colours, so it is visible for keyboard users only.
  - `SkipTarget` is a zero-height `View` with `nativeID={id}` and `tabIndex={-1}`, so it can take programmatic focus but is not in the tab order. Hide its focus outline (web-only style; cast if the RN type rejects it).
  - If this React Native Web version does not pass `tabIndex` or `nativeID` through, check the rendered DOM in the manual step and use the supported prop instead.
- [ ] **Step 6: Place them in `WorkListSections.tsx`.**
  - `SeriesSection`: after the section title and before the rows, `<SkipLink label="Skip series list" targetId="after-series" />`; after the last row, `<SkipTarget id="after-series" />`.
  - `MoreByAuthor`: `label="Skip more by this author"`, `targetId="after-more-by-author"`, same placement.
  - Both components still return `null` when they have no rows, so no link appears for an empty list. `MoreByAuthor` is also used on the author page; the link is harmless there.
  - `EditionsSection` (in `EditionsSection.tsx`): `label="Skip editions list"`, `targetId="after-editions"`, link after the "Find Your Edition" title, target after the cards and the "+N / Show fewer" control, inside the same `View`. It already returns `null` for no editions.
- [ ] **Step 7: Typecheck and run all tests.** `npm run typecheck && npm test` → pass.
- [ ] **Step 8: Manual web check.** `npm run start --workspace=apps/app`, press `w`, open a work that has a series and works by the same author. Tab from the title: "Skip editions list" appears and Enter moves focus past the edition cards; further down, "Skip series list" appears and Enter moves focus past the series rows; the next Tab lands on the "More by this author" skip link, and Enter there lands on "Find this book". Open a work with no series: no series skip link. Open a list linked to one service: only that service shows "Unlink …". Check a list with a book that has no Open Library cover (placeholder shows) and the footer link opens `https://hardcover.app/?referrer_id=173231`.
- [ ] **Step 9: Commit.** `git commit -m "feat(app): skip links past the series, editions and more-by-author lists"`

---

### Task 5: Docs

**Files:**
- Modify: `docs/CODEBASE.md`

- [ ] **Step 1: Update the rows** that already describe `listCovers.ts`, `CoverStack.tsx` and `WorkListSections.tsx` (the `CoverStack` row is near line 108), and update the `EditionsSection` row, and add rows for `listActions.ts`, `skipLink.ts` and `components/SkipLink.tsx`, matching the table's one-sentence style. Mention that the footer now credits Hardcover.
- [ ] **Step 2: Final check.** `npm run typecheck && npm test` from the repo root → pass.
- [ ] **Step 3: Commit.** `git commit -m "docs: codebase map covers list labels, covers and skip links"`
