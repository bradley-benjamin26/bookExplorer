# UX Feedback Round 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 12 problems the user found in the round 4 release: missing hover text, pages laid out differently from each other, an unexplained save prompt from the lock, and the combined Subjects & Genres section.

**Architecture:** Two new shared components, `DetailTop` (centred image, title, byline and one row of actions) and `AboutSection`, give the book, work, author and subject pages the same top. Every page then follows the same order. The lock logic moves out of `TermsSection` into a `useEditLock` hook, so one `LockButton` in the actions row controls the Genres, Subjects and Notes sections. Pure logic (`visibleSubjects`) goes in `termsDraft.ts` with a test beside it, and screens only wire it in.

**Tech Stack:** Expo SDK 57 / Expo Router / React Native Web 0.21, TanStack Query, vitest, lucide-react-native.

**Spec:** `docs/10_27_to-dos.txt` (item numbers below cite it).

**Findings that shape the plan (checked 2026-10-27):**
- **Item 1: hover text works; the browser's delay is the problem.** The user found that the tooltips do appear on shelfthread.com after a long hover, and asked for a shorter pause that still isn't instant. The browser's `title` tooltip delay is set by the operating system, and a page can't change it. So Task 1 swaps the native tooltip for a small custom one with a 500 ms delay, while keeping the existing `titleRef` API.
- RN Web 0.21 doesn't forward a `title` prop, so `titleRef` (`apps/app/src/webTitle.ts`) stays the only way to set hover text.
- **Repo audit, 2026-10-27** (tests and typecheck pass: 278 app, 302 server). Findings 1 to 4 below are part of this plan. #1 a book's notes are deleted without a warning when it leaves its last list (Task 5). #2 nine clickable text links have no accessibility role (Task 1, Step 4). #3 the work page's Save star never fills (Task 2, Step 2). #4 `toggleSaved` and `isItemSaved` are used only by tests (Task 6).

**Decisions made here (the user confirms them in plan review):**
- Item 1, "the save button should read copy link": this plan takes it to mean the **Share** button's hover text, which becomes "Copy link". The visible label stays "Share", because on native the button opens the share sheet. If the user wants the visible label changed on web too, that is one line in `ShareButton`.
- Item 6, "all pages": the four entity pages (book, work, author, subject). Lists, Settings and My Library are tool pages with no title block.
- Item 9: the single lock sits in the top actions row, as `[Share] [Save to list] [lock]`, on book and work pages. It controls Genres, Subjects and Notes. While locked, notes show as read-only text. Authors and subjects have nothing to edit, so their pages have no lock.
- Item 8: three sections, headed "Genres", "Subjects" and "Awards", in that order. Awards stay read-only.
- Item 10: while unlocked, every subject shows, because a collapsed list would hide terms the user may want to remove.

## Global Constraints

- Read the Expo v57 docs (`https://docs.expo.dev/versions/v57.0.0/`) before writing Expo code (`apps/app/AGENTS.md`).
- No new npm dependencies.
- Exact copy: "Copy link", "Genres", "Subjects", "Awards", "Series: {name}", "Show all {n} subjects", "Show fewer subjects", "Edit genres, subjects and notes", "Lock and save your edits", "Your Notes", "Save this book to a list before editing its genres, subjects and notes."
- Section order on every entity page: `DetailTop` (image, title, byline, actions row) → About → View as Graph / Find Connection → the page's own sections → Footer. A page that lacks a piece skips it and keeps the rest in order.
- Every `Pressable` or `Button` that someone can click has hover text through `titleRef` or `Button`'s `tooltip`. Hover text appears after `TOOLTIP_DELAY_MS = 500`.
- Test runners: app `cd apps/app && npx vitest run <file>`. Whole repo: `npm run typecheck && npm test` from the root.
- Screens are not unit-tested in this repo. Each screen task ends with a by-eye check on web: `npm run dev:server` plus `cd apps/app && npx expo start --web`, at 390×844 and at desktop width, in light and dark.
- Branch `ux-feedback-round-5`, cut from `main`. The first commit includes `docs/10_27_to-dos.txt` and this plan. Make one commit per task, each message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **"Link copied" hidden again on a narrow phone.** At 320 px wide, `[Share] [Save to list] [lock]` must stay on one line. If it wraps, the status text under Share is covered again. *Test: Task 2 sets the row to `flexWrap: "nowrap"`. The by-eye check runs at 320×640 as well as at 390.*
2. **LCSH labels that don't match exactly.** A saved record's labels can differ in case or punctuation from the API's tagged terms ("Science fiction" vs "Science Fiction."), so LCSH priority must compare by `subjectKey`, not by `===`. *Test: Task 3, `visibleSubjects` "matches LCSH terms by subjectKey".*
3. **A tooltip stuck on screen.** Clicking a chip changes the page and removes the hovered element without a `pointerout`, so the tip could hang over the next page. The tip must hide on `pointerdown`, and it must never show on touch, where a tap fires `pointerover` too. *Test: by-eye check in Task 1, Step 6; the `pointerType === "mouse"` and `pointerdown` rules in Task 1's Interfaces.*
4. **Cancelling the save prompt.** Someone taps the lock on an unsaved book, reads the notice, and taps Cancel. The page must stay locked. If they save it later from the Save button, the page may unlock (they did ask to edit), but nothing may be lost or saved without their action. *Test: by-eye check in Task 4.*
5. **Edits lost when the lock moves.** Notes still autosave as before. Genre and subject drafts must still be saved when someone leaves the page unlocked, as `TermsSection` does today with `useFocusEffect`. Moving that logic into `useEditLock` must keep the blur and unmount save. *Test: by-eye check in Task 3: unlock, remove a subject, press Back, reopen, and the subject is gone.*

---

### Task 1: Hover text (item 1)

**Files:**
- Modify: `apps/app/src/webTitle.ts`, test `apps/app/src/webTitle.test.ts`; `apps/app/app/_layout.tsx` (mount the tooltip); `apps/app/src/components/ShareButton.tsx` (tooltip copy); `apps/app/app/book/[isbn].tsx`, `apps/app/app/work/[id].tsx`, `apps/app/app/author/[id].tsx`, `apps/app/app/settings.tsx`, plus any other untitled `Pressable` that Step 4 finds
- Create: `apps/app/src/components/WebTooltip.tsx`

**Interfaces:**
- Produces:
  - `titleRef(text)` keeps its signature, so its ~60 call sites don't change. It now sets `data-tooltip` instead of `title`. Leaving `title` off is what stops the browser's slow tooltip from showing as well; screen readers keep the `aria-label` each control already has.
  - `TOOLTIP_DELAY_MS = 500` and `tooltipPosition(target: { x: number; y: number; width: number; height: number }, tip: { width: number; height: number }, viewport: { width: number; height: number }): { left: number; top: number }` in `webTitle.ts`. The tip goes 6 px below the target, centred on it and clamped 8 px inside the viewport, and flips 6 px above the target when there is no room below.
  - `WebTooltip()`: renders `null` unless `Platform.OS === "web"`. On web it adds listeners on `document` (removed on unmount):
    - `pointerover` with `pointerType === "mouse"`, and `focusin`: if `target.closest("[data-tooltip]")` finds an element, wait `TOOLTIP_DELAY_MS`, then show its text at `tooltipPosition(...)`.
    - `pointerout` leaving that element, `focusout`, `pointerdown`, `scroll` (capture) and `keydown` Escape: cancel the timer and hide the tip.
    - The tip is a `position: fixed` element with `pointerEvents: "none"` and `role="tooltip"`, in `colors.ink` on `colors.paper` with a `colors.border` border, `radii.sm`, `typeScale.xs` and `maxWidth: 240`.

- [ ] **Step 1: Write the failing tests** in `webTitle.test.ts`. Change the existing "sets the title attribute" test to expect `setAttribute("data-tooltip", "Zoom in")`, and add:

```ts
const vp = { width: 400, height: 800 };
it("centres the tip below the target", () =>
  expect(tooltipPosition({ x: 100, y: 10, width: 40, height: 40 }, { width: 60, height: 20 }, vp)).toEqual({ left: 90, top: 56 }));
it("keeps the tip inside the viewport", () =>
  expect(tooltipPosition({ x: 380, y: 10, width: 20, height: 20 }, { width: 100, height: 20 }, vp).left).toBe(292));
it("flips above when there is no room below", () =>
  expect(tooltipPosition({ x: 100, y: 770, width: 40, height: 20 }, { width: 60, height: 20 }, vp).top).toBe(744));
```

- [ ] **Step 2: Run** `cd apps/app && npx vitest run src/webTitle.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `tooltipPosition` and the `data-tooltip` change. Build `WebTooltip` and mount it once in `_layout.tsx`, next to the root `Stack`. Run the test again. Expected: PASS.
- [ ] **Step 4: Fill the gaps.** Run `grep -rn "<Pressable" apps/app/app apps/app/src/components | grep -v titleRef`, and give every hit that a person can press a `ref={titleRef(...)}`. Known gaps:
  - author name links on book and work: `View {author.name}`
  - "via Wikipedia" and "via Library of Congress" credits: `Read the source on Wikipedia` and `Read the source at the Library of Congress`
  - the "View in LOC catalog" row: `View this book in the LOC catalog`
  - the "Saved: …" edition link on work: `View the saved edition`
  - the author's "View on Open Library" link: `View this author on Open Library`
  - the author relation rows: `View {item.label}`
  - the photo credit: `Photo source on Wikipedia`
  - Settings' "Add new library": `Add a library to Find This Book`
  Skip the full-screen modal backdrops (`accessibilityLabel="Close"`).
  - **Audit #2: these same links have no `accessibilityRole`.** A screen reader reads them as plain text, so the user can't tell they open anything. Give each one a role while adding its hover text. Use `accessibilityRole="link"` for the ones that call `Linking.openURL`: the "via Wikipedia" and "via Library of Congress" credits, "Photo via Wikipedia", "View on Open Library" on the author page, and the LOC credit on the work page. Use `"button"` for the in-app author links and the "Saved: …" edition link. The full list, from the audit: `author/[id].tsx` lines 69, 90 and 105; `work/[id].tsx` lines 91, 115 and 166; `book/[isbn].tsx` lines 111, 250 and 254. Line numbers are from `main` before this plan's changes.
  - The grep above matches only the line that holds `<Pressable`, and most of them put `ref=` on the next line. Use `grep -rn -A6 "<Pressable"` and read each hit.
- [ ] **Step 5: Share hover reads "Copy link".** In `ShareButton`, change `tooltip="Copy a link to this page"` to `tooltip="Copy link"`.
- [ ] **Step 6: Verify.** Run `npm run typecheck`. Then, on the local web build:
  - hover over the shelf icon, Share, an author link and a relation row: each shows its text after about half a second, and only our tip appears, never the browser's
  - Tab onto a button: the tip shows there too
  - check in dark mode
  - Review Focus 3: hover a chip, then click it so the page changes; no tip is left behind
- [ ] **Step 7: Commit** (`feat(app): faster hover tooltips; Share says Copy link`).

---

### Task 2: One page structure: centred top, side-by-side actions, About first (items 2, 4, 5, 6, 7, 11, 12)

**Files:**
- Create: `apps/app/src/components/DetailTop.tsx`, `apps/app/src/components/AboutSection.tsx`
- Modify: `apps/app/app/book/[isbn].tsx`, `apps/app/app/work/[id].tsx`, `apps/app/app/author/[id].tsx`, `apps/app/app/subject/[slug].tsx`, `apps/app/src/components/WorkListSections.tsx`, `apps/app/src/components/WorkSaveButton.tsx`

**Interfaces:**
- Produces:
  - `DetailTop({ image, title, children, actions }: { image?: ReactNode; title: string; children?: ReactNode; actions: ReactNode })`. A full-width column with `alignItems: "center"`, and the title in `fonts.display` / `typeScale.lg`, centred (the styles from today's work page `header` and `title`). `children` is the byline: authors, dates, rating, work count. `actions` renders in a row with `flexDirection: "row"`, `flexWrap: "nowrap"`, `justifyContent: "center"`, `alignItems: "center"`, `gap: spacing.sm` and `marginTop: spacing.md`. Task 3 adds the lock to this row.
  - `AboutSection({ text, credit }: { text: string; credit?: ReactNode })`. Heading "About", then `ExpandableText`, then `credit` (the "via …" link or `GoogleBooksAttribution`). It uses the book page's `aboutSection`, `description` and `viewMore` styles.

- [ ] **Step 1: Build `DetailTop` and `AboutSection`.**
- [ ] **Step 2: Work page.** Use `DetailTop` with the cover as `image`, the authors and `RatingBadge` as `children`, and `<ShareButton/><WorkSaveButton/>` as `actions`. Keep the "Saved: …" link right under it.
  - **Audit #3: the work page's Save star never fills.** `WorkSaveButton`'s pill (`apps/app/src/components/WorkSaveButton.tsx`) passes no `active` to `Button`. Choosing "Save the work instead" therefore leaves an empty star, while the book and author pages fill theirs. Add a prop, `saved: boolean`, and render the pill with `active={saved}` and `accessibilityLabel={saved ? "Save to list, saved" : "Save to list"}`, as `AddToListButton` does. The work page passes `saved={!!savedRecord || !!savedEdition}`. Check by eye: save the work, and the star fills; remove it from My Library, go back, and the star empties. Then add `AboutSection` (with the LOC credit), then View as Graph / Find Connection, then Editions, then the terms and notes (unchanged until Task 3), then Series, More by author and Reviews.
- [ ] **Step 3: Book page.** Use the same `DetailTop`: the cover plus its Google Books cover credit as `image`, the authors and rating as `children`, and `<ShareButton/><AddToListButton/>` as `actions`, with no `marginTop` on either. Then add `AboutSection`, carrying today's Wikipedia, LOC or Google Books credit as `credit`. Then View as Graph / Find Connection, moved up from below the terms (item 5). Then Format, the terms and notes, Find This Book and Reviews.
- [ ] **Step 4: Author page.** `DetailTop` takes the photo plus "Photo via Wikipedia" as `image`, the dates as `children`, and `<ShareButton/><AddToListButton/>` as `actions`. The bio becomes `AboutSection` with the "via Wikipedia" credit. Then View as Graph / Find Connection. Then pseudonyms, the no-Wikidata note, "View on Open Library", Works and the relation sections.
- [ ] **Step 5: Subject page.** `DetailTop` (no image) takes the work count as `children` and `<ShareButton/>` as `actions`. `data.description` becomes `AboutSection`. Then View as Graph, with `tooltip="See this subject's books and related subjects as a graph"`. Then broader and narrower topics, and Books. Delete the "No Wikidata concept match found for this subject." block (item 7), but keep the `noMatch` style, because the sort fallback message uses it.
- [ ] **Step 6: Series heading (item 4).** In `SeriesSection`, render the heading as `` `Series: ${data.name}` ``.
- [ ] **Step 7: Verify** at 390×844, at 320×640 and at desktop width, in light and dark, on one book, one work, one author and one subject:
  - all four tops are centred
  - Share and Save sit side by side, and "Link copied" shows under Share without being covered
  - About comes right under the actions
  - the graph buttons sit in the same place on book and work
  - a series heading reads "Series: …"
  Run `npm run typecheck`.
- [ ] **Step 8: Commit** (`feat(app): same centred top and section order on every detail page`).

---

### Task 3: Separate Genres, Subjects and Awards, one lock, and a subjects accordion (items 8, 9, 10)

**Files:**
- Create: `apps/app/src/useEditLock.ts`
- Modify: `apps/app/src/termsDraft.ts`, test `apps/app/src/termsDraft.test.ts`; `apps/app/src/components/TermsSection.tsx`; `apps/app/app/book/[isbn].tsx`, `apps/app/app/work/[id].tsx`

**Interfaces:**
- Consumes: `DetailTop`'s `actions` row (Task 2).
- Produces:
  - `export const SUBJECTS_SHOWN = 5` and `visibleSubjects(labels: string[], tagged: TaggedTerm[], limit = SUBJECTS_SHOWN): string[]` in `termsDraft.ts`. It returns at most `limit` labels: first the labels whose `subjectKey` matches a `tagged` term with `"lcsh"` in its `sources`, then the rest, each group in its original order.
  - `useEditLock({ record, onUpdate, onRequestSave, startUnlocked }: { record: Terms | null; onUpdate: (c: Terms) => Promise<unknown>; onRequestSave: () => void; startUnlocked?: boolean }): { unlocked: boolean; draft: Terms; edit: (kind: keyof Terms, change: (list: string[]) => string[]) => void; toggle: () => Promise<void>; error: string | null }`. This is today's `TermsSection` logic moved as it is: the pending unlock, the save on toggle, and the `useFocusEffect` save on blur and unmount.
  - `LockButton({ unlocked, onPress }: { unlocked: boolean; onPress: () => void })`, the icon from today's `TermsSection` heading. Its label and `titleRef` are "Edit genres, subjects and notes" while locked and "Lock and save your edits" while unlocked.
  - `TermsSection({ kind, labels, unlocked, onEdit, tagged }: { kind: keyof Terms; labels: string[]; unlocked: boolean; onEdit: (change: (list: string[]) => string[]) => void; tagged?: TaggedTerm[] })`. It renders one section headed "Genres" or "Subjects", with today's chip, × and `AddTermField` behaviour. It renders nothing when `labels` is empty and the page is locked.
  - `AwardsSection({ awards }: { awards: string[] })`: a read-only section headed "Awards", or nothing when empty.

- [ ] **Step 1: Write the failing tests** in `termsDraft.test.ts`

```ts
const t = (label: string, lcsh: boolean): TaggedTerm => ({ label, sources: lcsh ? ["lcsh"] : ["openLibrary"] });
it("puts LCSH subjects first, then fills to five", () => {
  const labels = ["A", "B", "C", "D", "E", "F", "G"];
  expect(visibleSubjects(labels, [t("F", true), t("C", true), t("A", false)])).toEqual(["C", "F", "A", "B", "D"]);
});
it("matches LCSH terms by subjectKey", () => {
  expect(visibleSubjects(["x", "y", "z", "w", "v", "Science fiction"], [t("Science Fiction.", true)])[0]).toBe("Science fiction");
});
it("returns short lists unchanged", () => {
  expect(visibleSubjects(["b", "a"], [t("a", true)])).toEqual(["a", "b"]);
  expect(visibleSubjects([], [])).toEqual([]);
});
```

- [ ] **Step 2: Run** `cd apps/app && npx vitest run src/termsDraft.test.ts`. Expected: FAIL, because `visibleSubjects` is not exported.
- [ ] **Step 3: Implement `visibleSubjects`.** Run the test again. Expected: PASS.
- [ ] **Step 4: Split `TermsSection.tsx`** into `LockButton`, `TermsSection` and `AwardsSection` as above, and move the state into `useEditLock`.
  - The Subjects section, while locked and with more than `SUBJECTS_SHOWN` labels, shows `visibleSubjects(labels, tagged ?? [])` and a pill `Button` reading "Show all {n} subjects". Once expanded, it reads "Show fewer subjects", has `accessibilityState={{ expanded }}`, and its `tooltip` matches its text.
  - While unlocked, every label shows and the toggle is hidden.
  - `error` from the hook renders under the actions row, in `colors.danger`.
- [ ] **Step 5: Book and work pages.**
  - Call `useEditLock` once per page, with the same `record`, `onUpdate` and `onRequestSave` the page passes to `TermsSection` today. The book page also passes `startUnlocked={edit === "1"}`.
  - Add `<LockButton/>` to the `DetailTop` actions, after Save.
  - In place of the one `TermsSection`, render `TermsSection kind="genres"`, then `TermsSection kind="subjects" tagged={data.subjects}`, then `AwardsSection`. Each section gets `labels` from `unlocked ? draft[kind] : saved-or-API labels` (today's `shown` logic).
  - Notes come next. While unlocked and the item is saved, render `SavedRecordEditor`. While locked, render "Your Notes" read-only, only when `record.notes` is non-empty. This replaces the book page's separate "Your Notes" block, and the work page gains the same block.
- [ ] **Step 6: Verify.**
  - Run the tests (PASS) and `npm run typecheck`.
  - By eye on a saved book with more than five subjects:
    - Genres, Subjects and Awards are separate sections
    - five subjects show, LCSH ones first, and the toggle expands and collapses the list
    - the one lock unlocks Genres, Subjects and Notes together, and locking keeps the edits after a reload
    - Review Focus 5: unlock, remove a subject, press Back, reopen, and the subject is gone
- [ ] **Step 7: Commit** (`feat(app): separate Genres, Subjects and Awards under one lock; subjects accordion`).

---

### Task 4: Tell the user why the lock asks them to save (item 3)

**Files:**
- Modify: `apps/app/src/components/AddToListButton.tsx`, `apps/app/src/components/WorkSaveButton.tsx`, `apps/app/src/useEditLock.ts`

**Interfaces:**
- Consumes: `useEditLock` (Task 3).
- Produces:
  - `SaveSheetHandle = { open: (notice?: string) => void }`. Existing callers that pass nothing are unchanged.
  - `export const SAVE_FIRST_NOTICE = "Save this book to a list before editing its genres, subjects and notes."` in `useEditLock.ts`.

- [ ] **Step 1: `AddToListButton`.** `open(notice)` stores `notice` in state, and the pill's own `show()` clears it. While set, it renders under "Choose a list" in `fonts.body` / `typeScale.sm` / `colors.ink`, with `accessibilityLiveRegion="polite"`.
- [ ] **Step 2: `WorkSaveButton`.** `open(notice)` shows the same text under "Choose an edition", and passes it to `sheet.current?.open(notice)`. That covers both the path that picks an edition and the path with no ISBN edition.
- [ ] **Step 3: `useEditLock`.** `onRequestSave` becomes `(notice: string) => void`. `toggle()` on an unsaved record calls `onRequestSave(SAVE_FIRST_NOTICE)`. On the pages, pass it through to `saveSheet.current?.open(notice)`.
- [ ] **Step 4: Verify.**
  - Run `npm run typecheck`.
  - By eye: on an unsaved book, the lock opens the sheet with the notice. Tapping Done with a list ticked saves the book and unlocks the page.
  - On an unsaved work, the edition popup shows the notice.
  - Review Focus 4: the plain "Save to list" pill shows no notice, and Cancel after the notice leaves the page locked.
- [ ] **Step 5: Commit** (`feat(app): explain why the lock asks to save first`).

---

### Task 5: Warn before leaving the last list deletes notes (audit #1)

**Why:** If an item leaves its last list, `applyListChanges` → `unsaveIfUnlisted` removes it from the library and wipes its notes, subjects and genres (`withoutContent`). Two paths do this with one tap and no warning: the "Remove" button in `lists/[id].tsx` (`handleRemove`), and unticking the last list in the Save sheet and pressing Done (`AddToListButton.done`). Deleting a whole list already asks first, using a `window.confirm` / `Alert.alert` pair in `lists/[id].tsx` `confirmDelete`. The same rule should behave the same way on all three paths.

**Files:**
- Create: `apps/app/src/confirm.ts`
- Modify: `apps/app/src/storage/listMembership.ts`, test `apps/app/src/storage/listMembership.test.ts`; `apps/app/app/lists/[id].tsx`; `apps/app/src/components/AddToListButton.tsx`

**Interfaces:**
- Produces:
  - `leavesLibrary(lists: SavedList[], member: Pick<ListMember, "type" | "id">, checked: Set<string>): boolean` in `listMembership.ts`. It is true when some list in `lists` holds `member` now and `checked` names none of the ids in `lists`.
  - `confirmDestructive(title: string, message: string, action: string): Promise<boolean>` in `confirm.ts`. On web it uses `window.confirm(message)`. On native it uses `Alert.alert(title, message, [Cancel (style "cancel"), action (style "destructive")])`, and the promise resolves with the choice. `lists/[id].tsx` `confirmDelete` switches to it, with `action = "Delete"`.
  - Exact copy: title `"Remove from your library?"`, message `` `“${member.title}” is on no other list, so it leaves your library and its notes are deleted. This can't be undone.` ``, action `"Remove"`.

- [ ] **Step 1: Write the failing tests** in `listMembership.test.ts`:

```ts
describe("leavesLibrary", () => {
  const m = { type: "book" as const, id: "1" };
  const list = (id: string, held: boolean) => ({ id, members: held ? [{ ...m, title: "t", addedAt: 0 }] : [] }) as unknown as SavedList;
  it("is true when the only list holding it is unticked", () => expect(leavesLibrary([list("a", true), list("b", false)], m, new Set())).toBe(true));
  it("is false while any list stays ticked", () => expect(leavesLibrary([list("a", true), list("b", false)], m, new Set(["b"]))).toBe(false));
  it("is false for an item on no list yet", () => expect(leavesLibrary([list("a", false)], m, new Set())).toBe(false));
});
```

- [ ] **Step 2: Run** `cd apps/app && npx vitest run src/storage/listMembership.test.ts`. Expected: FAIL, because `leavesLibrary` is not exported.
- [ ] **Step 3: Implement** `leavesLibrary` and `confirmDestructive`. Move `confirmDelete` onto `confirmDestructive`. Run the test again. Expected: PASS.
- [ ] **Step 4: Wire both paths.**
  - `AddToListButton.done`: when `leavesLibrary(lists, member, checked)` is true, `await confirmDestructive(...)` first. On Cancel, return with the sheet still open and nothing applied.
  - `lists/[id].tsx` `handleRemove`: call `getLists(kind)` and pass `checked` = the ids of the other lists that hold the member. Ask `leavesLibrary` and confirm in the same way.
- [ ] **Step 5: Verify.**
  - Run `npm run typecheck`.
  - By eye on web: add a note to a book that is on one list.
    - Press Remove on that list's page, then Cancel. The book and its note stay.
    - Untick the list in the Save sheet and press Done. The warning appears.
  - Moving a book between two lists in one Done shows no warning.
- [ ] **Step 6: Commit** (`fix(app): warn before leaving the last list deletes a book's notes`).

---

### Task 6: Delete `toggleSaved` and `isItemSaved` (audit #4)

**Why:** No screen calls either one. Saving goes through `ensureSaved` and removing through `removeSaved` (`apps/app/src/storage/savedItems.ts`). Only tests call `toggleSaved` and `isItemSaved`, so they are ~25 lines that must be kept passing for nothing.

**Files:**
- Modify: `apps/app/src/storage/savedItems.ts`, `savedItems.test.ts`, `snapshot.test.ts`, `apps/app/src/backup.test.ts`, `apps/app/src/queryCache.test.ts`

- [ ] **Step 1:** Delete both functions. Wherever a test calls `toggleSaved(x)` to set up a saved item, call `ensureSaved(x)` instead. Wherever it calls `toggleSaved` on an item that is already saved, to remove it, call `removeSaved(type, id)`. Replace `isItemSaved(t, id)` with `(await getSavedItems()).some((i) => i.type === t && i.id === id)`. Delete the tests that only tested the toggle itself.
- [ ] **Step 2:** Run `git grep -nw "toggleSaved\|isItemSaved" -- apps` (expected: no output), then `cd apps/app && npx vitest run` (expected: PASS).
- [ ] **Step 3: Commit** (`refactor(app): drop unused toggleSaved and isItemSaved`).

---

### Task 7: Whole-branch check

- [ ] **Step 1:** From the root, run `npm run typecheck && npm test`. Expected: all pass.
- [ ] **Step 2:** On one book, one work, one author and one subject, at 390×844 and at desktop width, in light and dark, walk items 1–12 of `docs/10_27_to-dos.txt` and tick each one off.
- [ ] **Step 3:** Push and open a PR against `main`. List items 1–12 and audit fixes 1–4 in the description, ending with the 🤖 Claude Code line.
