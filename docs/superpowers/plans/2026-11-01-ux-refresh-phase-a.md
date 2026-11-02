# UX Refresh Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Warm the cool-grey neutrals, cut the tag chips to two hues, settle the border radii, give list rows a tinted press/hover state, and show the feedback banner once on Home with a dismiss button.

**Architecture:** Token-level changes first (`themeColors.ts`, `theme.ts`), then the few consumers of removed or changed tokens, then one tiny pure helper (`rowFeedback`) applied to row-style Pressables, then a small `FeedbackBanner` component backed by one AsyncStorage flag. No new dependencies; no structural or layout changes (those are Phase B).

**Tech Stack:** Expo SDK 57 / Expo Router, React Native (web + native), lucide-react-native, AsyncStorage, vitest.

**Spec:** `docs/UX_REVIEW_2026-11-01.md` (findings 1, 4, 8, 9; "Order of work → Phase A"). Phase B is out of scope.

## Global Constraints

- Work on a branch in a worktree off `main` (suggested name `feat/ux-refresh-a`), never on `main` itself. The in-flight plan `docs/superpowers/plans/2026-11-01-library-and-hardcover-polish.md` also edits `app/index.tsx` and `app/_layout.tsx`; if the two branches meet, keep both sides' changes.
- Expo SDK 57: read https://docs.expo.dev/versions/v57.0.0/ before touching an Expo API (`apps/app/AGENTS.md`).
- No new dependencies. App tests are vitest on pure logic only; there is no component-test setup and none is added. Screens are verified by typecheck, the web export, and the manual checks written into each task.
- Commands, from the repo root: `npm test -w apps/app -- <pattern>`, `npm run typecheck`, `cd apps/app && npx expo export --platform web`.
- Style: colors, fonts, spacing and radii only from the theme via `useThemedStyles`; one-line why-comments; keep existing `titleRef(...)` tooltips and accessibility props.
- WCAG: every token pair below must be covered by a contrast test in `src/theme.test.ts` (text ≥ 4.5:1, borders and non-text ≥ 3:1).
- Do not rewrite the banner's wording (it is the owner's voice).
- Out of scope, do not start: header, My Library, detail-page layout, the `card` surface token, skeleton loading (all Phase B).

## Review Focus

1. **Every re-valued token pair still passes contrast in light and dark** (muted/faint text, input and pill borders, both chips, text on the press tint). Tests: Tasks 1 and 2.
2. **Banner dismissal survives a reload, and any unreadable stored value counts as "not dismissed"** (so a corrupt flag shows the banner rather than hiding it for good). While the flag is still loading, nothing renders (no flash of banner for someone who dismissed it). Test: Task 5.
3. **The feedback form stays reachable after the banner leaves every screen but Home**, including on Home once dismissed. Check: Task 5 manual step (Footer link).
4. **A row with no `onPress` never tints on hover** (`WorkListRow` renders disabled when `onPress` is absent). Check: Task 4 manual step.
5. **Removing the `chip*Accent`, `link` and `kicker` tokens leaves no dangling reference**, including in dark mode and in the Subject page's concept tag. Check: `npm run typecheck` in Task 2.

---

### Task 1: Warm neutral palette and press/hover tokens

**Files:**
- Modify: `apps/app/src/themeColors.ts` (the two palettes, plus two new `ThemeColors` fields)
- Test: `apps/app/src/theme.test.ts`

**Interfaces:**
- Produces: `ThemeColors.pressedBackground: string` and `ThemeColors.hoverBackground: string`, used by Task 4. All other token names unchanged.

New values (any token not listed keeps its current value):

| token | light | dark |
|---|---|---|
| `shellBackground` | `#EFEAE0` | `#121110` |
| `background`, `paper` | `#FAF7F0` (unchanged) | `#1C1B18` |
| `text`, `ink` | `#262320` | `#EDEAE2` (unchanged) |
| `textMuted` | `#6B655A` | `#A39E92` |
| `textFaint` | `#665F55` | `#9A9588` |
| `inkFaint` | `#5F594F` | `#A29D90` |
| `border` | `#EEE8DA` | `#2B2924` |
| `cardBorder` | `#E6DFD0` | `#34312B` |
| `inputBorder` | `#857D6E` | `#7A766B` |
| `chipBackground` | `#F1EBDD` | `#26241F` |
| `pillBorder` | `#8C877B` (unchanged) | `#77736A` |
| `pressedBackground` (new) | `#EFE8D8` | `#2C2A25` |
| `hoverBackground` (new) | `#F5F0E4` | `#23211D` |

Verified offline: every pair in the Step 1 test clears its minimum with these values (smallest margins: light `pillBorder` on `chipBackground` 3.01, light `textMuted` on `paper` 5.40, dark `genre` pair 4.87 in Task 2).

- [ ] **Step 1: Write the failing tests** in `theme.test.ts`, appended to the `it.each` table of the `%s theme contrast` block: `["textMuted on paper", c.textMuted, c.paper, 4.5]`, `["ink on pressedBackground", c.ink, c.pressedBackground, 4.5]`, `["ink on hoverBackground", c.ink, c.hoverBackground, 4.5]`, `["inkFaint on chipBackground", c.inkFaint, c.chipBackground, 4.5]`.
- [ ] **Step 2: Run** `npm test -w apps/app -- theme`. Expected: FAIL (the `pressedBackground` and `hoverBackground` rows have an undefined colour; it must fail, not pass vacuously).
- [ ] **Step 3: Add the two fields to the `ThemeColors` interface (with a one-line comment: tint behind a pressed/hovered list row) and apply the table to `lightColors` and `darkColors`.**
- [ ] **Step 4: Run** `npm test -w apps/app -- theme` (PASS, including the existing rows) then `npm run typecheck` (exit 0).
- [ ] **Step 5: Commit:** `git add apps/app/src/themeColors.ts apps/app/src/theme.test.ts && git commit -m "feat(app): warm the neutral palette and add row press/hover tokens"`

---

### Task 2: Two-hue tag chips and dead-token cleanup

**Files:**
- Modify: `apps/app/src/themeColors.ts`, `apps/app/src/theme.ts`, `apps/app/src/components/TermsSection.tsx` (styles `subjectTag`, `subjectTagText`; the "matches the graph" comment above them), `apps/app/app/subject/[slug].tsx` (styles `conceptTag`, `conceptTagText`, around lines 145-154)
- Test: `apps/app/src/theme.test.ts`

**Interfaces:**
- Consumes: Task 1 palette (`cardBorder`, `chipBackground`, `ink`).
- Produces: `chipBackgroundGenre`/`chipTextGenre` now green; `chipBackgroundSubject`/`chipTextSubject` now warm neutral. **Removed:** `chipBackgroundAccent`, `chipBorderAccent`, `chipTextAccent`, `link` (from `ThemeColors` and both palettes) and `kicker` (from the `Theme` type and `buildTheme` in `theme.ts`). Graph colours (`graphGenre`, `graphSubject`, ...) are untouched, so graph nodes keep their hues.

New values:

| token | light | dark |
|---|---|---|
| `chipBackgroundGenre` | `#E4ECE7` | `#23332F` |
| `chipTextGenre` | `#2B5951` | `#6FA897` |
| `chipBackgroundSubject` | `#F1EBDD` | `#26241F` |
| `chipTextSubject` | `#262320` | `#EDEAE2` |

Decision: this deliberately drops the old rule that a subject chip matches the graph's subject colour. Update the comments in `themeColors.ts` and `TermsSection.tsx` that claim it. The Subject page's concept tag is a subject, so it uses the Subject chip tokens with a `colors.cardBorder` border (and `TermsSection`'s subject chip border changes from the text colour to `colors.cardBorder`). The Genre chip keeps its text-coloured border.

- [ ] **Step 1: Write the failing test** in `theme.test.ts`: add `["chipTextGenre on chipBackgroundGenre", c.chipTextGenre, c.chipBackgroundGenre, 4.5]` to the contrast table, and a new `it("has no cool-hued tag chips")` asserting `"chipBackgroundAccent" in lightColors` is `false` (same for `darkColors`).
- [ ] **Step 2: Run** `npm test -w apps/app -- theme`. Expected: FAIL (the old pink genre pair is checked against the new assertion only after the values change; the `in` assertion fails first).
- [ ] **Step 3: Apply the table, delete the removed tokens from the interface and both palettes, delete `kicker` from `Theme` and `buildTheme`, and update `TermsSection.tsx` and `subject/[slug].tsx` to the new tokens as described above.**
- [ ] **Step 4: Run** `npm test -w apps/app -- theme` (PASS) and `npm run typecheck` (exit 0; a leftover reference to a removed token fails here).
- [ ] **Step 5: Manual check** (web, `npx expo start --web`, light and dark): a book with genres and subjects shows green genre chips and warm neutral subject chips; a Subject page's concept tag matches the subject chips; text is readable in both modes.
- [ ] **Step 6: Commit:** `git add apps/app/src apps/app/app/subject && git commit -m "feat(app): two-hue tag chips, drop unused accent, link and kicker tokens"`

---

### Task 3: Settle the border radii

**Files:**
- Modify: `apps/app/src/theme.ts` (`radii`), then each literal listed below
- Test: `apps/app/src/theme.test.ts`

**Interfaces:**
- Produces: `radii = { xs: 4, sm: 8, md: 14, pill: 16, full: 999 }` (`sm` was 10; `xs` is new).

Replacements (literal → token):
- `4` → `radii.xs`: `CoverPlaceholder.tsx`, `WorkListRow.tsx` (`cover`), `Footer.tsx` (`logoBacking`), `EditionsSection.tsx` (two places: `cover` and the one at line ~135), `app/graph/[type]/[id].tsx` (`checkbox`).
- `6` or `8` → `radii.sm`: the two `cover` styles in `app/book/[isbn].tsx` and `app/work/[id].tsx`, `photo` in `app/author/[id].tsx`, `input` in `BatchScan.tsx`.
- Left alone on purpose: circles and fixed shapes (`node` radius 3 in `app/index.tsx`, `legendSwatch` radius 6 and `addLibraryIcon` radius 13 in `app/graph/[type]/[id].tsx` and `app/settings.tsx`) and the camera overlay frame in `app/scan.tsx`. The banner's radius 6 in `_layout.tsx` is handled by Task 5.

- [ ] **Step 1: Write the failing test** in `theme.test.ts`: `it("defines the four corner sizes")` asserting `radii` equals `{ xs: 4, sm: 8, md: 14, pill: 16, full: 999 }` (import `radii` next to `typeScale`).
- [ ] **Step 2: Run** `npm test -w apps/app -- theme`. Expected: FAIL.
- [ ] **Step 3: Update `radii` in `theme.ts`, then apply the replacements above.** Each file reads `radii` from its existing `createStyles` destructuring; add it there where missing.
- [ ] **Step 4: Run** `npm test -w apps/app -- theme` (PASS), `npm run typecheck` (exit 0), then `grep -rnE "borderRadius: [0-9]+" apps/app/app apps/app/src` and confirm only the "left alone" items above (plus the banner's, until Task 5) remain.
- [ ] **Step 5: Commit:** `git add apps/app && git commit -m "refactor(app): name the corner radii and replace literals"`

---

### Task 4: Tinted press and hover state on list rows

**Files:**
- Create: `apps/app/src/rowFeedback.ts`
- Modify: the row-style Pressables listed below
- Test: `apps/app/src/rowFeedback.test.ts`

**Interfaces:**
- Consumes: `ThemeColors.pressedBackground`, `ThemeColors.hoverBackground` (Task 1), `radii.sm` (Task 3).
- Produces: `rowFeedback(colors: Pick<ThemeColors, "pressedBackground" | "hoverBackground">, state: { pressed: boolean; hovered?: boolean }): { backgroundColor: string } | undefined`. Pressed wins over hovered; neither returns `undefined`. The file imports nothing from `react-native` (so the plain-node test can load it).

Apply to these full-width row Pressables, replacing `pressed && styles.pressed` with `rowFeedback(colors, { pressed, hovered })` (the style callback's parameter type gains `hovered?: boolean`, the same way existing code types `focused`): `recentItem` in `app/index.tsx`, `navRow` in `app/saved.tsx`, `row` in `src/components/WorkListRow.tsx` (**only when `onPress` is set**), `findRow` in `app/book/[isbn].tsx`, `src/components/LibraryFindLinks.tsx` and `app/work/[id].tsx` (if it has one), `row` in `app/lists/index.tsx`. Each of those row styles gains `marginHorizontal: -spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radii.sm` so the tint bleeds past the text instead of touching it, and loses its now-unused `pressed` entry only if nothing else in the file uses it. Buttons, pills, text links and icon buttons keep their `opacity: 0.6` press feedback (a tint would fight their own fill).

- [ ] **Step 1: Write the failing test** in `rowFeedback.test.ts`, with `colors = { pressedBackground: "#p", hoverBackground: "#h" }`: pressed returns `{ backgroundColor: "#p" }`; hovered only returns `{ backgroundColor: "#h" }`; pressed and hovered returns the pressed one; neither returns `undefined`.
- [ ] **Step 2: Run** `npm test -w apps/app -- rowFeedback`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `rowFeedback` in `src/rowFeedback.ts`** to the signature above.
- [ ] **Step 4: Run** `npm test -w apps/app -- rowFeedback` (PASS).
- [ ] **Step 5: Apply it to the listed rows** as described.
- [ ] **Step 6: Run** `npm run typecheck` (exit 0).
- [ ] **Step 7: Manual check** (web, light and dark): hovering a Recently-looked-at row, a My Library row, a list row and a Find-this-book row tints it; pressing darkens it; the hairline under the row is not visually clipped; a `WorkListRow` with no `onPress` (e.g. a series row for the current book) does not tint on hover.
- [ ] **Step 8: Commit:** `git add apps/app && git commit -m "feat(app): tinted press and hover state on list rows"`

---

### Task 5: Feedback banner once, on Home, dismissible

**Files:**
- Create: `apps/app/src/storage/feedbackBanner.ts`, `apps/app/src/components/FeedbackBanner.tsx`, `apps/app/src/feedback.ts`
- Modify: `apps/app/app/_layout.tsx` (delete the banner block, its `feedbackBanner`/`feedbackLink` styles and any imports left unused), `apps/app/app/index.tsx` (render the banner), `apps/app/src/components/Footer.tsx` (add the link)
- Test: `apps/app/src/storage/feedbackBanner.test.ts`

**Interfaces:**
- Produces:
  - `FEEDBACK_FORM_URL: string` in `src/feedback.ts` (the Google Forms URL currently inline in `_layout.tsx`, copied verbatim).
  - `isFeedbackBannerDismissed(): Promise<boolean>` and `dismissFeedbackBanner(): Promise<void>` in `src/storage/feedbackBanner.ts`. Key `"book-explorer:feedback-banner-dismissed"`, stored value `"1"`; any other value, a missing key or a thrown read means `false`. Per-device and not part of the library snapshot (same as the theme preference), so do not touch `snapshot.ts`.
  - `<FeedbackBanner />`: renders `null` until the stored flag has loaded, and `null` once dismissed. Otherwise the existing banner (same text, same link, same left-border style, `radii.sm` corners) plus a dismiss control (lucide `X`, `accessibilityRole="button"`, `accessibilityLabel="Dismiss feedback request"`, 44pt target via `hitSlop`) that persists the dismissal and hides the banner immediately.

- [ ] **Step 1: Write the failing tests** in `feedbackBanner.test.ts` (mock AsyncStorage the way `preferences.test.ts` does and clear it in `beforeEach`): `isFeedbackBannerDismissed()` is `false` with nothing stored; `true` after `dismissFeedbackBanner()`; `false` when the key holds `"yes"` or `"{"`.
- [ ] **Step 2: Run** `npm test -w apps/app -- feedbackBanner`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement the two storage functions** to the contract above (wrap the read in try/catch returning `false`).
- [ ] **Step 4: Run** `npm test -w apps/app -- feedbackBanner` (PASS).
- [ ] **Step 5: Add `src/feedback.ts`, build `FeedbackBanner`, and render it at the top of Home's `inner` view in `app/index.tsx`, above the header.** Move the banner's text, link and styles out of `_layout.tsx` into the component; delete the block from `_layout.tsx`.
- [ ] **Step 6: Add a "Share feedback" link to `Footer.tsx`** under the existing Open Library link (`accessibilityRole="link"`, `titleRef("Open the feedback form")`, `Linking.openURL(FEEDBACK_FORM_URL)`, same text style as the existing link). This keeps the form reachable on every screen that shows the footer, including Home after the banner is dismissed.
- [ ] **Step 7: Run** `npm run typecheck` (exit 0) and `grep -n "docs.google.com" apps/app/app/_layout.tsx` (no output).
- [ ] **Step 8: Manual check** (web): the banner shows on Home and on no other screen; its dismiss button hides it; after a page reload it stays hidden; clearing site data brings it back; the footer link opens the form from Book, Settings and Home.
- [ ] **Step 9: Commit:** `git add apps/app && git commit -m "feat(app): show the feedback banner once on Home with a dismiss button"`

---

## Verification (after Task 5)

- [ ] `npm test -w apps/app` (all pass), `npm run typecheck` (exit 0), `cd apps/app && npx expo export --platform web` (exit 0; CI runs the last two).
- [ ] Look at Home, a Book page, My Library and a Subject page in light and dark on a phone-width window and on desktop width. The neutrals should read warm, with no remaining cool-grey surfaces or lavender/pink chips, and rows should tint on hover.

## Self-review notes

- Spec coverage: review finding 1 → Task 5, 4 → Tasks 1-2, 8 → Task 4 (rows only; buttons, pills and links keep the fade, by design), 9 → Task 3. Findings 2, 3, 5, 6, 7, 10 are Phase B. The `card` surface token from the spec's palette is deferred with it (nothing in Phase A uses it).
- Deviation from the spec: it said "three radii"; the plan keeps four named sizes (`xs`, `sm`, `md`, `pill`) because 4px thumbnails and 8px controls are both in use.
- Deviation from the spec: the form link goes into the Footer only, not About, because the polish plan rewrites `about.tsx` into accordions.
