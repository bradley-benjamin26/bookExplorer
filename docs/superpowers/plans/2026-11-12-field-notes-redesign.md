# "Reader's Field Notes" Redesign and Thread Rule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Shelf Thread the sage-and-rust "reader's field notes" look from the design review and its two prototypes, and add a second, curvier thread (with a loop) under the header.

**Architecture:** App-side only. The palette change is made once in `themeColors.ts` and guarded by contrast tests; screens then pick up new tokens, with a short list of screens restructured to match the prototypes (Home, detail pages, My Library, graph). Both threads (the header rule and Home's) come from one pure geometry function (testable) drawn with `react-native-svg`; Home's is animated and built from a list of real, prepared author → book → subject threads, one picked at random per visit. No new dependencies; the graph keeps its d3-force layout and drag behaviour.

**Tech Stack:** Expo Router app (React Native Web), `react-native-svg` (already installed), vitest (pure `.ts` tests only; the app has no component tests, so screens are checked by typecheck and a manual web run in light and dark).

**Spec:** [docs/UI_DESIGN_REVIEW.md](../../UI_DESIGN_REVIEW.md), with [docs/home-prototype.html](../../home-prototype.html) and [docs/graph-prototype.html](../../graph-prototype.html) (both rendered at 480px and read in full). The thread request comes from the 2026-11-12 conversation.

**Scope:** the review's "What to try first" list and the two prototypes. The review's follow-up sections (freemium, printable maps, SVG/PDF export, the journey trail) are proposals the review itself calls open, so they are **out of scope** and need their own plans.

**Decisions made while planning** (each is one line to change):
- **Thread request:** "another chain like the one on the homepage" is read as a second, purely decorative thread, drawn as a curvy line with one loop and the same four node colours, shown under the header on every screen (web header only; the native stack keeps its platform header). The existing straight Home thread stays for empty states.
- **Palette roles:** rust is the one action colour, so `primary` = burnt orange and link/text accents (`cover`) = deeper rust. Saved/"yours" states move to slate blue (`marginalia`); graph highlights use rust. This resolves the review's warning that rust can't carry both meanings.
- **Graph nodes stay circles** (their sizes drive the layout and drag clearance in `graphLayout.ts`); the prototype's card-shaped nodes are not adopted. Everything else in the graph prototype is.
- **Home's thread is real and clickable** (your answer): a prepared list of six real threads, each an author, one of their books, and a subject that book carries, picked at random each time Home is shown (never the same one twice in a row). Each stop opens its real page, and a link opens the book's graph. The line is drawn in as a curvy, looped thread, and the prototype's "imagined example" wording is replaced because nothing is imagined. Home shows it for every reader, above Recently looked at, as the prototype does.
- **Detail pages:** "View as graph" becomes the one filled action and moves above Save/Share; "Find connection" becomes an outlined secondary button.

## Global Constraints

- Light palette, exact: page `#EDF3E8`, card/sheet `#F8FAF4`, text `#202B25`, primary `#B94E25`, button text `#FFFFFF`, links/orange text `#A84623`, secondary accent slate blue `#375663`.
- Contrast floors: text 4.5:1, non-text UI (borders, focus rings, graph nodes) 3:1. Review's pairs must hold exactly: white on `#B94E25` 5.02, `#202B25` on `#EDF3E8` 12.96, `#A84623` on `#EDF3E8` 5.21.
- Dark mode is its own tuned palette, not an inversion, and passes the same tests.
- Buttons are softly rounded rectangles (7px); chips for real filters and subject/genre tags stay full pills.
- Fonts stay Fraunces and Inter. No new dependencies.
- Prepared threads must be true: each book is by that author and carries that subject on Open Library, and every id was checked against the live API (see Task 5).
- Every thread, node and swatch is decorative or paired with text; meaning never depends on colour alone. Decorative graphics are hidden from assistive tech.
- Reduced motion: nothing new animates.
- House style: comments state the why in one line; `// shortcut: <limit>, <when to upgrade>` for known limits; every new module ships with its `*.test.ts`.

## Review Focus

1. **A long title.** A 60-character book title on Home recents, detail page, list rows and graph header wraps and never overlaps the thread or controls. (Manual check, Task 10.)
2. **Dark mode contrast, not just light.** Every new token pair has a dark-mode test. (Task 1.)
3. **Keyboard focus is visible on sage and on rust.** The focus ring is its own token that passes 3:1 against paper, card and primary. (Task 1 test.)
4. **Narrow phone width (320px).** The thread rule is clipped to the window width, not scrolled. (Task 4 test: geometry stays inside any width, down to 240.)
5. **Screen readers.** Decorative thread lines announce nothing; Home's three stops are real links with full labels ("Ursula K. Le Guin, author. Meet author"); the "Graph / List" toggle announces which is selected; "You are here" is read for the centred node. (Tasks 5 and 9, manual check.)
6. **Home offline or with a failing source.** The prepared threads are static, so Home still renders; a tap that cannot load shows the destination page's own error state. (Task 5 manual check.)
7. **Random pick.** Never the same thread twice in a row; a random value of exactly 0 or just under 1 still picks a valid thread. (Task 5 tests.)

---

## File Structure

- Modify `apps/app/src/themeColors.ts`, `apps/app/src/theme.ts`, `apps/app/src/theme.test.ts`: palette, focus token, button radius.
- Create `apps/app/src/threadGeometry.ts` (+ test), `apps/app/src/components/ThreadRule.tsx`: the shared curvy thread geometry and the header rule.
- Create `apps/app/src/homeThreads.ts` (+ test), `apps/app/src/components/HomeThread.tsx`: Home's real, animated, clickable thread.
- Modify `apps/app/src/threadReveal.ts` (+ test): `revealAt`.
- Create `apps/app/src/components/SegmentedControl.tsx`: Graph/List toggle.
- Modify `Button.tsx`, `DetailTop.tsx`, `HeaderTitle.tsx`, `libraryRows.ts` (+ test), `app/index.tsx`, `app/saved.tsx`, `app/work/[id].tsx`, `app/book/[isbn].tsx`, `app/graph/[type]/[id].tsx`, `app/_layout.tsx`, `docs/CODEBASE.md`.

Commands run from `apps/app`.

---

### Task 1: Sage-and-rust palette, light and dark

**Files:**
- Modify: `apps/app/src/themeColors.ts`, `apps/app/src/theme.test.ts`

**Interfaces:**
- Produces: `ThemeColors.focus: string` (new). Existing token names are unchanged; their values change as below.

Light values (contrast checked against `paper` `#EDF3E8` unless noted): `background`/`paper` `#EDF3E8`; `shellBackground` `#E3EADF`; `card` `#F8FAF4`; `text`/`ink` `#202B25`; `textMuted`/`textFaint`/`inkFaint` `#4C5C50`; `border` `#C9D5C7`; `cardBorder` `#B6C8B7`; `inputBorder`/`pillBorder` `#718477`; `chipBackground` `#E2EBE0`; `pressedBackground` `#DCE7DA`; `hoverBackground`/`emptyBackground`/`coverLight` `#E4EDE1`; `primary` `#B94E25`; `primaryText` `#FFFFFF`; `cover` `#A84623`; `marginalia` `#375663`; `pillActiveBackground` `#DCE7DA` (selected chip, ink text); `thread` `#6A8071`; `focus` `#244E76`; graph: `graphWork` `#963B1B`, `graphAuthor` `#375663`, `graphSubject` `#506D4D`, `graphGenre` `#7A4A86`, `graphAward` `#7A5F12`; chips: subject text `#3F5A3C` on `#DDE8D9`, genre text `#6A3F75` on `#EADFEE`; `danger` `#A33232` on `dangerBackground` `#F7E6E3`; `warning` `#7A5A00`.

Dark values (on `paper` `#161D19`): `background`/`paper` `#161D19`; `shellBackground` `#0F1411`; `card` `#1E2722`; `text`/`ink` `#E6EDE4`; `textMuted`/`textFaint`/`inkFaint` `#A9B7AC`; `border` `#2A352E`; `cardBorder` `#34423A`; `inputBorder`/`pillBorder` `#7F9385`; `chipBackground` `#222B26`; `pressedBackground` `#2A352E`; `hoverBackground` `#1E2722`; `emptyBackground` `#1E2722`; `coverLight` `#25302A`; `primary` `#B94E25` (white text 5.02, 3.41 on paper); `primaryText` `#FFFFFF`; `cover` `#E58A63`; `marginalia` `#8FB4C4`; `pillActiveBackground` `#4B7A8C` (white text 4.71); `thread` `#6F8575`; `focus` `#8FB4C4`; graph: `graphWork` `#E58A63`, `graphAuthor` `#8FB4C4`, `graphSubject` `#9FC49A`, `graphGenre` `#D3A6E0`, `graphAward` `#D9BC6A`; chips: subject text `#A9D0A4` on `#233226`, genre text `#D9B3E6` on `#2E2336`; `danger` `#FF9A9A` on `dangerBackground` `#3A2222`; `warning` `#E0AB52`.

Every value above was checked against the floors in Global Constraints; the tests below are the gate if one is tuned.

- [ ] **Step 1: Write the failing tests** in `theme.test.ts`:
  - `it("keeps the review's three pairs")` for light: `contrast("#FFFFFF", lightColors.primary)` ≈ 5.02, `contrast(lightColors.ink, lightColors.paper)` ≈ 12.96, `contrast(lightColors.cover, lightColors.paper)` ≈ 5.21 (`toBeCloseTo(x, 1)`).
  - In the existing `describe.each` (runs for both themes), add rows: `focus vs paper`, `focus vs card`, `focus vs primary` ≥ 3 (Review Focus 3); `graphWork`, `graphAuthor`, `graphSubject`, `graphGenre` each vs `paper` and vs `card` ≥ 3; `marginalia on paper` ≥ 4.5; `ink on pillActiveBackground` for light and `primaryText on pillActiveBackground` for dark ≥ 4.5 (branch on theme name); `primary vs paper` stays ≥ 3.
- [ ] **Step 2: Run them.** `npx vitest run src/theme.test.ts` → FAIL (`focus` missing, old palette).
- [ ] **Step 3: Add `focus` to the `ThemeColors` interface** (with a one-line comment) and replace every value in `lightColors` and `darkColors` with the lists above.
- [ ] **Step 4: Run them** → PASS. If a pair fails, adjust lightness of that one value until it passes and note the new hex in this plan.
- [ ] **Step 5: Run the whole suite.** `npm test` → fix any test that asserted an old hex.
- [ ] **Step 6: Commit.** `git add src && git commit -m "feat(app): sage-and-rust palette with its own dark tuning"`

---

### Task 2: Colour roles and focus rings

**Files:**
- Modify: every file that sets `outlineColor: …cover` (`app/index.tsx`, `Button.tsx`, `PressableRow.tsx`, `AccordionSection.tsx`, `MyLibraryButton.tsx`, `NewSearchButton.tsx`, `FeedbackBanner.tsx`, `AboutButton.tsx`) and every use of `colors.marginalia`.

**Interfaces:**
- Consumes: `ThemeColors.focus`, `marginalia`, `cover`, `primary` from Task 1.

- [ ] **Step 1: Focus rings.** Replace `outlineColor: colors.cover` (or `theme.colors.cover`) with `…focus` and `outlineWidth: 2` with `3`, adding `outlineOffset: 2` where the style type allows it. `grep -rn "outlineColor" src app` → no remaining `cover`.
- [ ] **Step 2: Reassign roles.** `grep -rn "marginalia" src app`. Rule: saved/"yours" indicators keep `marginalia` (now slate blue); graph highlight and "current node" uses `primary` (rust) instead of `marginalia`; text links, icons and the search underline keep `cover` (now rust).
- [ ] **Step 3: Typecheck and tests.** `npm run typecheck && npm test` → pass.
- [ ] **Step 4: Commit.** `git commit -m "refactor(app): focus ring token; saved states slate, highlights rust"`

---

### Task 3: Rectangular actions, chips for filters

**Files:**
- Modify: `apps/app/src/theme.ts`, `apps/app/src/components/Button.tsx`, `apps/app/app/index.tsx`, `apps/app/src/theme.test.ts`

**Interfaces:**
- Produces: `radii.button = 7`; `Button` `variant: "primary" | "pill" | "chip"`. `"pill"` keeps its name and look but with `radii.button`; `"chip"` is the old pill look (`radii.pill`) for real filters.

- [ ] **Step 1: Write the failing test** in `theme.test.ts`: `radii.button` is `7` and is smaller than `radii.pill` (the review asks for 6–8px).
- [ ] **Step 2: Run it** → FAIL.
- [ ] **Step 3: Add `button: 7` to `radii`; add the `"chip"` variant to `Button`** (same props and `selected` state as `"pill"`; style = the current pill style); change the `pill` style's `borderRadius` to `radii.button`.
- [ ] **Step 4: Run it** → PASS.
- [ ] **Step 5: Use `"chip"` where the control is a real filter:** the recent-items filter row on Home (`FILTERS`). Leave `settings.tsx`, `TermsSection.tsx` (subject/genre tags) and the other `radii.pill` styles as they are.
- [ ] **Step 6: Typecheck and tests**, then commit: `git commit -m "feat(app): rectangular action buttons; chips stay for filters"`

---

### Task 4: Shared thread geometry

**Files:**
- Create: `apps/app/src/threadGeometry.ts`, `apps/app/src/threadGeometry.test.ts`
- Modify: `apps/app/src/threadReveal.ts`, `apps/app/src/threadReveal.test.ts` (create if absent)

**Interfaces:**
- Produces: `threadGeometry(width: number, height: number, stops: number, inset = 8): { d: string; length: number; points: { x: number; y: number; at: number }[] }`. `d` is an SVG path; `length` its sampled length in px; each point is a stop on the path with `at` the fraction (0–1) of the length where the line reaches it.
- Produces: `revealAt(progress: number, at: number): number` in `threadReveal.ts`: the existing fade formula with an explicit position (`nodeReveal` becomes a call to it with `at = index / (count - 1)`).

Geometry decision: cubic Béziers left to right with a gentle wander (amplitude about 30% of `height`) and **one loop** near the middle, where the control points swing back so the curve crosses itself like a looped thread. Stops are evenly spaced in x between `inset` and `width - inset`, on the path.

- [ ] **Step 1: Write the failing tests** in `threadGeometry.test.ts`:
  - 4 stops, width 320, height 28 → 4 points, x strictly increasing, every x in `[8, 312]`, every y in `[0, 28]`, `at` strictly increasing with first near 0 and last near 1.
  - `d` starts with `"M"` and has at least 4 `"C"` segments.
  - The loop exists: at least one `C` segment has a control point with x less than that segment's start x.
  - Width 240 and width 1200 stay in bounds (Review Focus 4); `length` is greater than the width.
  - `inset = width / 6` with 3 stops puts the stops at the centres of three equal columns (x ≈ w/6, w/2, 5w/6).
  - Deterministic: the same arguments give the same `d`.
  - In `threadReveal.test.ts`: `revealAt(0, 0.5)` is 0, `revealAt(0.5, 0.5)` is 1, and `nodeReveal(p, i, n)` equals `revealAt(p, i / (n - 1))` for a few values.
- [ ] **Step 2: Run them.** `npx vitest run src/threadGeometry.test.ts src/threadReveal.test.ts` → FAIL.
- [ ] **Step 3: Implement** `threadGeometry` (sample each Bézier into a polyline to get `length` and each stop's `at`) and `revealAt`.
- [ ] **Step 4: Run them** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(app): shared curved, looped thread geometry"`

---

### Task 5: Home with a real, animated, clickable thread

**Files:**
- Create: `apps/app/src/homeThreads.ts`, `apps/app/src/homeThreads.test.ts`, `apps/app/src/components/HomeThread.tsx`
- Modify: `apps/app/app/index.tsx`, `apps/app/src/components/HeaderTitle.tsx`

**Interfaces:**
- Consumes: `threadGeometry`, `revealAt` (Task 4); `routes.author`, `routes.work`, `routes.subject`, `routes.graph` from `src/navigation.ts`.
- Produces: `type HomeThread = { id: string; author: { id: string; name: string }; work: { id: string; title: string }; subject: { slug: string; label: string } }`; `HOME_THREADS: readonly HomeThread[]`; `pickThread(random?: () => number, exclude?: string): HomeThread` (`random` defaults to `Math.random`; `exclude` is a thread id never returned when more than one thread exists); `HomeThread()` component (picks one itself).

The prepared threads. Each author, work and subject slug was found on Open Library on 2026-11-12, and each work lists that subject:

| id | Author | Work | Subject |
|---|---|---|---|
| `le-guin` | Ursula K. Le Guin `OL31353A` | The Left Hand of Darkness `OL59800W` | Science fiction `science_fiction` |
| `butler` | Octavia E. Butler `OL30802A` | Kindred `OL35616W` | Time travel `time_travel` |
| `morrison` | Toni Morrison `OL31120A` | Beloved `OL50548W` | Historical fiction `historical_fiction` |
| `pratchett` | Terry Pratchett `OL25712A` | Guards! Guards! `OL453735W` | Fantasy `fantasy` |
| `shelley` | Mary Shelley `OL25342A` | Frankenstein; or, The Modern Prometheus `OL450063W` | Epistolary fiction `epistolary_fiction` |
| `clarke` | Susanna Clarke `OL1387961A` | Jonathan Strange and Mr. Norrell `OL5703422W` | Magic `magic` |

Copy, exact: eyebrow `Find your next read`; heading `Every book has a thread.`; intro `Start with a book you love. Follow its connections to authors, subjects, and your next discovery.`; section heading `See where a thread leads`; section intro `An author leads to a book, and a book to a subject you might follow next. Tap a stop to explore.`; stop kind labels `An author`, `One of their books`, `A subject they write about`; stop actions `Meet author →`, `Explore book →`, `Explore subject →`; graph link `Explore this thread as a graph →`; header tagline `A little further into books`.

- [ ] **Step 1: Write the failing tests** in `homeThreads.test.ts`:
  - `HOME_THREADS` has the six ids above, all unique; author ids match `/^OL\d+A$/`, work ids `/^OL\d+W$/`, subject slugs `/^[a-z0-9_]+$/`; every name, title and label is non-empty.
  - `pickThread(() => 0).id` is `"le-guin"`; `pickThread(() => 0.999999)` returns a thread (the last one); `pickThread(() => 0.5)` is deterministic.
  - `pickThread(() => 0, "le-guin")` is not `le-guin`, and for rng values `0, 0.2, 0.4, 0.6, 0.8, 0.999999` with `exclude = "pratchett"` the result is never `pratchett` (Review Focus 7).
- [ ] **Step 2: Run them.** `npx vitest run src/homeThreads.test.ts` → FAIL.
- [ ] **Step 3: Implement `HOME_THREADS` and `pickThread`** in `homeThreads.ts`.
- [ ] **Step 4: Run them** → PASS.
- [ ] **Step 5: Verify every link is real.** With the server running, request `/api/authors/<id>`, `/api/works/<id>` and `/api/subjects/<slug>` for all six threads, with the same headers the app sends (see `src/api/client.ts`). Expected: 18 responses, all 200 with a title or name. Replace any thread that fails with another verified one, and update the table above.
- [ ] **Step 6: Build `HomeThread.tsx`.**
  - Picks its thread in `useState(() => pickThread())`, and re-picks (excluding the current id) when Home regains focus after leaving it (`useFocusEffect`, skipping the first run). The section is `key`ed by thread id so each new pick draws in again.
  - Layout: three equal columns (author, work, subject, in that order). A `react-native-svg` `Svg` behind them draws `threadGeometry(width, 96, 3, width / 6)` (`width` from `onLayout`) as a single `Path`: stroke `colors.thread`, width 2, round caps and joins, no fill. Nodes are `Circle`s (r = 6, a `paper` ring) at the points, coloured `graphAuthor`, `graphWork`, `graphSubject`. Under each node: the kind label (Inter, `inkFaint`), the title (Fraunces) and the action text (`cover` colour, semibold).
  - Animation: one shared value `progress` 0 → 1 over 1600 ms (`Easing.inOut(Easing.cubic)`), like `ThreadMotif`. The path uses `strokeDasharray={[length, length]}` and an animated `strokeDashoffset = length * (1 - progress)` (`Animated.createAnimatedComponent(Path)` with `useAnimatedProps`). Each node's opacity and scale come from `revealAt(progress, point.at)`, so a node appears as the line reaches it. Reduced motion (`useReducedMotion`) starts `progress` at 1.
  - Each column is one `Pressable` (`accessibilityRole="link"`, label e.g. `Ursula K. Le Guin, author. Meet author`) that pushes `routes.author(...)`, `routes.work(...)` or `routes.subject(slug, label)`. The thread line and nodes are hidden from assistive tech; the column text is not. Below the three columns, a text link `Explore this thread as a graph →` pushes `routes.graph("work", work.id)`.
  - `// shortcut: six prepared threads, add more to HOME_THREADS when readers see repeats.`
- [ ] **Step 7: Restructure `index.tsx`.** Top to bottom: eyebrow, heading and intro (copy above); the rust Scan button; the search field as a bordered box (`inputBorder`, `card` background, `radii.button`, search icon inside on the right) instead of an underline; the "See where a thread leads" section with `HomeThread`; then Recently looked at (unchanged, with its threaded rows and `chip` filters from Task 3). The thread section shows for every reader, not only first visits. Move `FeedbackBanner` to just above the footer. `ThreadMotif` stays for other screens' empty states.
- [ ] **Step 8: `HeaderTitle.tsx`:** tagline `A little further into books`; add a small rust `BookOpen` icon (lucide, 28px, decorative) left of the wordmark on Home.
- [ ] **Step 9: Typecheck, tests, manual check.** `npm run typecheck && npm test`. In the web app: the thread draws in once, a node appears as the line reaches it, each stop opens the right page, the graph link opens that book's graph, going Back and returning to Home picks a different thread, and with reduced motion on the thread is simply there. With the network off, Home still renders (Review Focus 6). Tab through the three stops with the keyboard.
- [ ] **Step 10: Commit.** `git commit -m "feat(app): Home shows a real, animated thread to follow"`

---

### Task 6: Detail pages put the graph first

**Files:**
- Modify: `apps/app/src/components/DetailTop.tsx`, `apps/app/app/work/[id].tsx`, `apps/app/app/book/[isbn].tsx`

- [ ] **Step 1: `DetailTop`:** render `primaryActions` before `actions` (graph above Save/Share), and give the primary row `flexWrap: "wrap"`.
- [ ] **Step 2: Both pages:** "View as graph" stays `variant="primary"` with `PRIMARY_ACTION_STYLE`; "Find connection" becomes `variant="pill"` (outlined rectangle), without `PRIMARY_ACTION_STYLE`. Accessibility labels and hints are unchanged.
- [ ] **Step 3: Typecheck and tests**, then commit: `git commit -m "feat(app): View as graph is the primary action on detail pages"`

---

### Task 7: The curvy thread under the header

**Files:**
- Create: `apps/app/src/components/ThreadRule.tsx`
- Modify: `apps/app/app/_layout.tsx` (the web `header` renderer, inside `<View role="banner">`, below `<Header …/>`)

**Interfaces:**
- Consumes: `threadGeometry(width, 28, 4)` from Task 4.
- Produces: `ThreadRule()` (no props).

- [ ] **Step 1: Build `ThreadRule.tsx`.** Measures its width with `onLayout` and renders a `react-native-svg` `Svg` of height 28: one `Path` (stroke `colors.thread`, width 1.5, round caps, no fill) and four `Circle`s in `graphWork`, `graphAuthor`, `graphSubject`, `graphGenre` (r = 5, a `paper` ring to match the Home thread). Hidden from assistive tech. Static: nothing animates here.
- [ ] **Step 2: Mount it** in `_layout.tsx` directly under `<Header …/>` inside the banner `View`. `// shortcut: web header only, the native stack keeps its platform header; add a native header renderer if wanted.`
- [ ] **Step 3: Typecheck, tests, manual check.** `npm run typecheck && npm test`; in the web app the thread shows under the header on Home, a book page, My Library and the graph, at 320px and 1200px, in light and dark, without horizontal scroll.
- [ ] **Step 4: Commit.** `git commit -m "feat(app): a curved, looped thread under the header"`

---

### Task 8: My Library leads with the reader's lists

**Files:**
- Modify: `apps/app/src/libraryRows.ts`, `apps/app/src/libraryRows.test.ts` (create if absent), `apps/app/app/saved.tsx`

**Interfaces:**
- Produces: `ACCOUNT_ROWS` (`hardcover`, `openlibrary`) and `DISCOVERY_ROWS` (`recommendations`, `connection`), both readonly arrays of `{ id, label }` taken from `LIBRARY_PRIMARY`.

- [ ] **Step 1: Write the failing test:** `ACCOUNT_ROWS` ids are `["hardcover","openlibrary"]`; `DISCOVERY_ROWS` ids are `["recommendations","connection"]`; together they equal `LIBRARY_PRIMARY`.
- [ ] **Step 2: Run it** → FAIL.
- [ ] **Step 3: Implement the two exports** from `LIBRARY_PRIMARY`.
- [ ] **Step 4: Run it** → PASS.
- [ ] **Step 5: Reorder `saved.tsx`:** "Your lists" (with "See all lists") first; then the `DISCOVERY_ROWS`; then a quiet heading "Accounts" with the `ACCOUNT_ROWS`; then Tools. Account rows no longer come first.
- [ ] **Step 6: Typecheck and tests**, then commit: `git commit -m "feat(app): My Library leads with lists, accounts follow"`

---

### Task 9: Graph screen to match the prototype

**Files:**
- Create: `apps/app/src/components/SegmentedControl.tsx`, `apps/app/src/graphLabels.ts` additions (+ tests in `graphLabels.test.ts`)
- Modify: `apps/app/app/graph/[type]/[id].tsx`

**Interfaces:**
- Produces: `SegmentedControl({ label: string, options: readonly string[], value: string, onChange: (v: string) => void })`; `centeredLabel(label: string | undefined): string` in `graphLabels.ts` returning `"Centered on <label>"` (or `"Centered on this item"` when undefined).

- [ ] **Step 1: Write the failing tests** in `graphLabels.test.ts`: `centeredLabel("The Map Room")` → `"Centered on The Map Room"`; `centeredLabel(undefined)` → `"Centered on this item"`.
- [ ] **Step 2: Run them** → FAIL. **Step 3: Implement `centeredLabel`.** **Step 4: Run** → PASS.
- [ ] **Step 5: Build `SegmentedControl`.** A bordered group (`inputBorder`, radius `radii.button`, 3px inner padding); each option a `Pressable` with `accessibilityRole="button"` and `accessibilityState={{ selected }}`; the selected one filled with `pillActiveBackground` with `primaryText`-contrast text (light: ink text; dark: white), unselected transparent. Container gets `accessibilityLabel={label}` and `role="group"` on web.
- [ ] **Step 6: Wire the graph screen** (the toolbar near line 435):
  - Above the graph: eyebrow `Follow the thread` (rust, small caps) and the existing `exploringTitle` as the visible heading; replace the hint with `Choose a connection to follow it. Select the center to open its page.`
  - Replace the two `Button variant="pill"` Graph/List buttons with `SegmentedControl` (`label="View connections as"`, options `["Graph","List"]`), keeping the existing `setListChosen`/`setShowList` logic.
  - "Filter" button stays, as an outlined `pill`; Share stays.
  - Back button text `Back` becomes `Previous thread` with matching `accessibilityLabel`; place it left of a `Centered on …` line (`accessibilityLiveRegion="polite"`, built with `centeredLabel`).
  - Surface: the SVG container gets `card` background, 1px `cardBorder`, radius 8.
  - Nodes keep their circles; lines use `thread`; the centre node gets a `primary` ring and a `You are here` label beneath its name (SVG text, same font as other labels) and `You are here` appended to its accessibility label.
  - Legend, list view and filter sheet are kept as they are (the review asks to preserve them).
- [ ] **Step 7: Typecheck, tests, manual check.** `npm run typecheck && npm test`; in the web app open a work's graph: toggle Graph/List with the keyboard, tap a node (Previous thread appears and works), filter, drag a node.
- [ ] **Step 8: Commit.** `git commit -m "feat(app): graph screen follows the prototype"`

---

### Task 10: Check light and dark with real data, then docs

**Files:**
- Modify: `docs/CODEBASE.md`

- [ ] **Step 1: Compare both modes** (review step 5). In the web app, in light and dark: Home (first visit and with recents), a work page with a long title and a cover, My Library, a graph, Settings, a list page. Look for any leftover old-palette colour, an unreadable pair, a clipped long title (Review Focus 1), or a missing focus ring when tabbing. Fix what's found in the file that owns it, one commit per fix.
- [ ] **Step 2: Docs.** Add rows to `docs/CODEBASE.md` for `threadGeometry.ts`, `ThreadRule.tsx`, `homeThreads.ts`, `HomeThread.tsx`, `SegmentedControl.tsx`; update the `themeColors.ts`, `Button.tsx` and `HeaderTitle.tsx` rows (new palette, `chip` variant, tagline).
- [ ] **Step 3: Final check.** `npm run typecheck && npm test` from the repo root → pass.
- [ ] **Step 4: Commit.** `git commit -m "docs: codebase map for the field-notes redesign"`
