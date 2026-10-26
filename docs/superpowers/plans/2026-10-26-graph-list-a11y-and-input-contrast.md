# Graph List Alternative and Input Border Contrast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the graph explorer's List view a complete non-visual equivalent of the canvas (it shows *how* things connect, not just *what* is there), and lock the input-border contrast fix in with a test.

**Architecture:** The canvas is already hidden from screen readers and overlaid with accessible node buttons, and a List toggle already exists (`app/graph/[type]/[id].tsx:797-820`). What the list lacks is the edges: a row says "Frank Herbert, Author" but not "Frank Herbert wrote Dune". One pure helper in `src/graphLabels.ts` turns a `Graph` plus a node id into relation sentences; both the list rows and the canvas overlay use it. The list then opens by default when a screen reader is running. The contrast fix is already in the working tree (`src/theme.ts`, `inputBorder` light `#85859a`, dark `#707082`); a token-contrast test stops it regressing.

**Tech Stack:** Expo / React Native (Expo SDK 57, read https://docs.expo.dev/versions/v57.0.0/ per `apps/app/AGENTS.md`), TypeScript, vitest.

**Spec:** `accessibilityFixPlan.txt` (WCAG 2.2 AA plan) and the "Open" note under item 12 in `docs/superpowers/plans/2026-10-21-feature-roadmap.md`: "graph canvas needs a non-visual alternative. The node list view added in #3 doubles as that."

## Global Constraints

- Target WCAG 2.2 AA: text contrast ≥ 4.5:1, non-text UI (input borders) ≥ 3:1 against `background`.
- Relation wording comes from `RELATION_LABELS`, read "source relation target", same as `pathSteps` and the canvas. Unknown relations fall back to the raw relation string.
- No new dependencies. `AccessibilityInfo` is from `react-native`.
- Run from `apps/app`: `npx tsc --noEmit` and `npm test` after each task.

## Review Focus

1. **Filtered graph:** an edge whose other end was filtered out must not produce a sentence with `undefined` in it. `applyGraphFilter` already drops such edges; the helper must still skip any edge with an id missing from `graph.nodes`. Test in Task 1.
2. **Center row:** the center touches every edge, so its row would read out the whole graph. Center row shows no relation line; every other row covers its own edges. Test in Task 1 (helper returns all sentences; the screen chooses not to render them for the center — covered by the Task 2 manual check).
3. **Filter leaves only the center:** the list must say why it's empty, not show a lone row. Manual check in Task 2.
4. **Screen reader turned on mid-session:** if the user hasn't touched the List/Graph toggle, switching the list on is right for someone who just enabled a screen reader; once they've toggled, screen-reader events never change the view. Not on web, where RN Web can't detect screen readers.
5. **Duplicate edges** (same source, target and relation): one sentence, not two. Test in Task 1.

---

### Task 1: Relation sentences helper

**Files:**
- Modify: `apps/app/src/graphLabels.ts`
- Modify: `apps/app/app/graph/[type]/[id].tsx:287-297` (`describeNodeRelations` becomes a call to the helper)
- Test: `apps/app/src/graphLabels.test.ts`

**Interfaces:**
- Produces: `export function nodeRelations(graph: Graph, nodeId: string): string[]` — one "source relation target" sentence per distinct edge touching `nodeId`, in edge order, skipping edges whose ends aren't in `graph.nodes`.

- [ ] **Step 1: Write the failing tests** in `graphLabels.test.ts`, `describe("nodeRelations")`, using a graph of `work:OL1W` "Dune", `author:OL2A` "Frank Herbert", `author:OL3A` "Brian Herbert" with edges `author:OL2A → work:OL1W "author"` and `author:OL3A → author:OL2A "influencedBy"`:
  - `nodeRelations(g, "author:OL2A")` equals `["Frank Herbert wrote Dune", "Brian Herbert influenced by Frank Herbert"]`
  - `nodeRelations(g, "work:OL1W")` equals `["Frank Herbert wrote Dune"]`
  - an edge with relation `"mystery"` gives `"Frank Herbert mystery Dune"`
  - an edge to `author:GONE` (not in `nodes`) is skipped
  - the `author` edge listed twice gives one sentence
- [ ] **Step 2: Run** `npx vitest run src/graphLabels.test.ts`. Expected: FAIL, `nodeRelations` is not exported.
- [ ] **Step 3: Implement `nodeRelations`** in `graphLabels.ts`: id→label map from `graph.nodes`, filter edges touching `nodeId` with both ends present, map through `RELATION_LABELS`, dedupe with a `Set`.
- [ ] **Step 4: Replace `describeNodeRelations`** in the graph screen with `nodeRelations(visible, nodeId).join(". ")` at its call site and delete the local function. `visible` is the filtered `Graph` already in scope (line 490), so the overlay keeps reading the same edges it draws.
- [ ] **Step 5: Run** `npx vitest run src/graphLabels.test.ts && npx tsc --noEmit`. Expected: PASS, no type errors.
- [ ] **Step 6: Commit**
  ```bash
  git add apps/app/src/graphLabels.ts apps/app/src/graphLabels.test.ts "apps/app/app/graph/[type]/[id].tsx"
  git commit -m "Share graph relation sentences between canvas overlay and list"
  ```

### Task 2: List view as the full non-visual alternative

**Files:**
- Modify: `apps/app/app/graph/[type]/[id].tsx` (list render at 797-820, back button at 787-796, `showList` state at 484, styles near 1125)

**Interfaces:**
- Consumes: `nodeRelations(graph, nodeId)` from Task 1.

- [ ] **Step 1: Relation line on each non-center row.** Under `node.label`, render `nodeRelations(visible, node.id).join(". ")` as a second `Text` (style `listRelations`: `fonts.body`, `typeScale.xs`, `colors.textFaint`). Skip it for the center row. Append the same text to the row's `accessibilityLabel` after the type. Wrap label + relations in a `View` with `flex: 1` so the type column stays right-aligned.
- [ ] **Step 2: List heading and empty state.** Above the rows, a `Text accessibilityRole="header"` reading `` `${count} connected to ${centerNode.label}` ``, where `count = orderedNodes.length - 1` (center excluded) and `centerNode` is `orderedNodes[0]` (not `center`, which is already the screen's route state) (the sort puts the center first). When that count is 0 (only reachable with a filter on), show `"Nothing left after filtering. Change the filter to see connections."` instead of rows.
- [ ] **Step 3: Back button.** Add `accessibilityRole="button"` and `accessibilityLabel="Back to previous graph"`, and hide the `ChevronLeft` with `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"` (wrap it in a `View` if the icon doesn't take those props).
- [ ] **Step 4: Default to the list for screen-reader users.** Add `const [listChosen, setListChosen] = useState(false)`; the toggle sets it `true`. In a `useEffect`, call `AccessibilityInfo.isScreenReaderEnabled()` and subscribe to `"screenReaderChanged"`; on a `true` result, `setShowList(true)` only while `listChosen` is `false`. Remove the subscription on unmount. Update the hint text at line 726 to: `"Tap a node to explore it. Screen reader users get a list of every connection; switch with the List button."`
- [ ] **Step 5: Verify.** `npx tsc --noEmit && npm test`. Expected: no type errors, all tests pass. Then `npx expo start --web`, open an author graph, press **List**: each non-center row shows lines like "Frank Herbert wrote Dune"; the heading shows the count; filtering out every type shows the empty message; **Back** after recentering is announced as a button (check with the browser's accessibility tree or VoiceOver on macOS).
- [ ] **Step 6: Commit**
  ```bash
  git add "apps/app/app/graph/[type]/[id].tsx"
  git commit -m "Graph list view: relation lines, heading, empty state, screen-reader default"
  ```

### Task 3: Lock in input border contrast

**Files:**
- Modify: `apps/app/src/theme.ts` (export `lightColors`, `darkColors`; the `inputBorder` values are already changed in the working tree)
- Create: `apps/app/src/theme.test.ts`

**Interfaces:**
- Produces: `export const lightColors: ThemeColors`, `export const darkColors: ThemeColors` (exported only for the test).

- [ ] **Step 1: Write the test** `theme.test.ts` with a local `contrast(a: string, b: string): number` (WCAG relative luminance, 6-digit hex). For both `lightColors` and `darkColors`, against `background`:
  - `inputBorder` ≥ 3
  - `textFaint` ≥ 4.5
  - `warning` ≥ 4.5
  Name each case after the token and theme, e.g. `"light inputBorder ≥ 3:1"`.
- [ ] **Step 2: Run** `npx vitest run src/theme.test.ts`. Expected: FAIL to import `lightColors` (not exported). Optional sanity check: temporarily set light `inputBorder` back to `#a8a8b8` and see that case fail at ~2.19.
- [ ] **Step 3: Export** `lightColors` and `darkColors` from `theme.ts`.
- [ ] **Step 4: Run** `npx vitest run src/theme.test.ts && npx tsc --noEmit`. Expected: PASS (light inputBorder ≈ 3.37, dark ≈ 3.55, textFaint 4.81 / 5.23, warning 4.93 / 8.30).
- [ ] **Step 5: Visual check.** In the web build, look at the Search field, Saved notes editor and Batch Scan input in light and dark: the border should be clearly visible but not heavier than the text.
- [ ] **Step 6: Commit**
  ```bash
  git add apps/app/src/theme.ts apps/app/src/theme.test.ts
  git commit -m "Raise input border contrast to 3:1 on the cream background; test theme contrast"
  ```

### Task 4: Close the item in the docs

**Files:**
- Modify: `docs/superpowers/plans/2026-10-21-feature-roadmap.md` (status table row "12 a11y", and the "Open: graph canvas…" bullet)

- [ ] **Step 1:** In the status table, replace "Still open: a non-visual alternative to the graph canvas." with "Graph List view is the non-visual alternative (relation sentences per node, default for screen readers)." Mark the "Open:" bullet under item 12 as done with the same pointer.
- [ ] **Step 2: Commit**
  ```bash
  git add docs/superpowers/plans/2026-10-21-feature-roadmap.md
  git commit -m "Docs: graph non-visual alternative done"
  ```
