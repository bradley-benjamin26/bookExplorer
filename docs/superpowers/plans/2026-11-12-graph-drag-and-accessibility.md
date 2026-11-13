# Graph Drag and Web Accessibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Graph nodes can be dragged and the graph settles with an animation (d3-force run live). On web, images have correct alt text (meaningful or null), pages expose ARIA landmarks, and WAVE's "underlined text" alerts are explained or fixed. A work page shows an English edition's cover when one exists.

**Architecture:** `d3-force` is already installed. Today it runs synchronously in `layoutGraph` and nothing moves. The synchronous layout stays as the polished resting layout. A new hook, `useGraphMotion`, animates nodes from the center node out to that layout when it appears. While a node is dragged, the hook runs a live d3 simulation, seeded from the current positions, with the same charge, link and collide forces and the center node pinned. React re-renders once per simulation tick. The canvas `Pan` gesture tests on touch-down whether the touch landed on a node. If it did, the gesture drags that node. If not, it pans the canvas as it does today. The accessibility items are small, mostly web-only prop changes: `accessibilityLabel` becomes `alt` in `expo-image` and react-native-web, and `role` becomes `<main>`, `<header>`, `<nav>` or `<footer>` in react-native-web.

**Tech Stack:** Expo Router 57 (web plus native), react-native-web 0.21, expo-image, d3-force 3, react-native-gesture-handler 2.32, react-native-reanimated 4.5, vitest.

**Spec:** [docs/11_12_26_to-dos.txt](../../11_12_26_to-dos.txt), items 3–7:
3. Implement https://d3js.org/d3-force so that nodes can be dragged and settle with an animation. Are there other possible improvements?
4. Add alt text for images. Book cover alt text should read "Book cover of (name of book) by (author)".
5. Implement ARIA landmarks/regions throughout the pages in the application/website.
6. WAVE seems to find text underlined that doesn't look underlined. Not sure if there is an issue to fix there.
7. Implement null alt text for spacer images.
8. (Added by the owner on 2026-11-12.) A work's cover should be an English edition's cover when one exists. If no English cover can be found, the existing logic stays.

**Decisions the owner confirmed on 2026-11-12:**
- **Where the cover alt text goes.** Alt text only goes on images that represent the page's main topic: the book or work cover on its own detail page, and the author photo, which already has alt text. Every other cover gets null alt (`""`). That includes edition covers, `WorkListRow`, `CoverStack`, and the recent list on Home.
- **What item 7's "spacer images" are.** They are the 1×1 transparent images Open Library serves when an ISBN has no cover. Those show up through the `expo-image` covers in `CoverStack` and the Home recent list, which currently render with no `alt` attribute at all. React-native-web's own `Image` already writes `alt=""` when it has no label, so `WorkListRow`, `EditionsSection` and `WorkSaveButton` need no change.
- **What a dragged node does on release.** It is released (`fx`/`fy` set back to `null`), so the forces pull it back into place: the settle animation. The center node is the exception: it stays where it is dropped.
- **Where the English cover applies (item 8).** Only to the work detail page's cover. A book page already shows its own edition's cover, looked up by its ISBN. List thumbnails, which come from the search `cover_i` in search, subject and "More by this author" rows, stay as they are.

## Global Constraints

- No new dependencies. Import `Header` and `getHeaderTitle` from `expo-router/react-navigation`, which re-exports `@react-navigation/elements`. Take `runOnJS` from `react-native-reanimated`, not `react-native-worklets`, which the app doesn't list as a dependency.
- Cover alt copy, exactly: `Book cover of {title} by {authors}`. Authors are joined as "A", "A and B", "A, B and C". With no authors, drop " by …".
- Logo alt copy: Wikidata footer logo `Wikidata`; Google Books logo `Google Books`. Keep the existing ones as they are: `Hardcover`, and `Photo of {name}` on author pages.
- Landmarks: `role="banner"` (header), `role="navigation"` with `accessibilityLabel="Site"` (header actions), `role="main"` (each screen's content), `role="contentinfo"` (`Footer`). The custom `header` renderer is **web only** (`Platform.OS === "web"`), because on iOS and Android it would replace the native header.
- Graph motion: entry animation 600 ms, ease-out cubic. Drag `alphaTarget` 0.15. Reduced motion (`useReducedMotion()` from reanimated) skips the entry animation and settles a drag release instantly.
- House style: one-line "why" comments; every new pure module ships with its `*.test.ts`; mark known limits `// shortcut: <limit>, <when to upgrade>`.
- Commands run from `apps/app`: tests `npx vitest run <file>`, types `npm run typecheck`.

## Review Focus

1. **A drag that ends on the node it started on.** On web the mouse-up fires the overlay `Pressable`'s click, so the graph would re-center or navigate after every drag. A release within 250 ms of a drag must not count as a press. (Task 5, manual check, plus the `shouldSuppressPress` unit test.)
2. **A node dragged past the canvas edge, or flung there by its neighbors.** Every node must stay inside the content box, or it disappears under the clipped viewport. (Task 4, `clampPoint` and bounds-force tests.)
3. **The filter or the center changes in the middle of the entry animation or a drag.** The old simulation must stop, without writing positions into the new layout or leaking timers. (Task 5, hook cleanup; manual check.)
4. **A 60-node subject graph on a mid-range Android phone.** Re-rendering on every tick must stay usable. (Task 5, device check; the fallback is the `shortcut:` note.)
5. **Native header and back button unchanged.** The banner wrapper must only render on web, and the web back button must still work. (Task 2, manual check on iOS or Android and on web.)

---

### Task 1: Cover alt text and null alt for spacer images (items 4 and 7)

**Files:**
- Create: `apps/app/src/coverAlt.ts`, `apps/app/src/coverAlt.test.ts`
- Modify: `apps/app/app/book/[isbn].tsx:123`, `apps/app/app/work/[id].tsx:106`, `apps/app/src/components/CoverStack.tsx:26`, `apps/app/app/index.tsx:147`, `apps/app/src/components/Footer.tsx:16`, `apps/app/src/components/GoogleBooksAttribution.tsx:15`

**Interfaces:**
- Produces: `coverAlt(title: string, authorNames: string[]): string`

- [ ] **Step 1: Write the failing test** `src/coverAlt.test.ts`:

```ts
it("names one author", () => expect(coverAlt("Dune", ["Frank Herbert"])).toBe("Book cover of Dune by Frank Herbert"));
it("joins two authors with and", () => expect(coverAlt("Good Omens", ["Terry Pratchett", "Neil Gaiman"])).toBe("Book cover of Good Omens by Terry Pratchett and Neil Gaiman"));
it("joins three or more with commas then and", () => expect(coverAlt("X", ["A", "B", "C"])).toBe("Book cover of X by A, B and C"));
it("drops 'by' with no authors", () => expect(coverAlt("Beowulf", [])).toBe("Book cover of Beowulf"));
```

- [ ] **Step 2: Run** `npx vitest run src/coverAlt.test.ts`. Expected: FAIL, because the module isn't found.
- [ ] **Step 3: Implement `coverAlt`** in `src/coverAlt.ts`. Write the join by hand, not with `Intl.ListFormat`, because Hermes support for it isn't guaranteed.
- [ ] **Step 4: Run the test again.** Expected: PASS.
- [ ] **Step 5: Wire it up.**
  - Book and work detail cover `<Image>`: `accessibilityLabel={coverAlt(data.title, data.authors.map((a) => a.name))}`.
  - `CoverStack` and the recent cover on Home (both `expo-image`): `accessibilityLabel=""`, with the one-line comment `// Decorative: null alt (the row names the book); also covers Open Library's 1x1 no-cover image.` Expo-image's web `<img>` writes `alt={accessibilityLabel}`, so `""` gives `alt=""` and `undefined` gives no `alt` attribute at all.
  - Footer Wikidata logo: `accessibilityLabel="Wikidata"`. Google Books logo: `accessibilityLabel="Google Books"`.
- [ ] **Step 6: Verify on web.** Run `npx expo start --web`, open Home (with a recent book), a book page, a work page and My Library. In devtools run `[...document.images].filter(i => !i.hasAttribute("alt"))`. Expected: `[]`. The book page cover's `alt` should read "Book cover of … by …". Run `npm run typecheck`, which should pass.
- [ ] **Step 7: Commit:** `git commit -m "fix(app): cover alt text and null alt for decorative covers"`

### Task 2: ARIA landmarks (item 5)

**Files:**
- Modify: `apps/app/app/_layout.tsx:106-144` (the `Stack`), `apps/app/src/components/HeaderActions.tsx:11`, `apps/app/src/components/Footer.tsx:14`

**Interfaces:** none new.

- [ ] **Step 1: Main.** On `<Stack>`, add `screenLayout={({ children }) => <View role="main" style={{ flex: 1 }}>{children}</View>}`. React Navigation renders `screenLayout` around the screen body only, below the header.
- [ ] **Step 2: Banner (web only).** In `screenOptions`, add `...(Platform.OS === "web" ? { header: ({ back, options, route }) => <View role="banner"><Header {...options} back={back} title={getHeaderTitle(options, route.name)} /></View> } : null)`, importing `Header` and `getHeaderTitle` from `expo-router/react-navigation`. With `back` set, the elements `Header` draws its own back button. Comment: `// Web only: on native this would replace the platform header.`
- [ ] **Step 3: Navigation and contentinfo.** Give the `HeaderActions` root `role="navigation" accessibilityLabel="Site"`, and the `Footer` root `role="contentinfo"`. The footer is rendered inside each screen's scroll content, so it sits inside `<main>`, where HTML doesn't count it as a page-level contentinfo landmark. Add `// shortcut: footer sits inside <main>, so it isn't a page-level contentinfo; move it out of the scroll if an audit flags it.`
- [ ] **Step 4: Verify on web.** Open Home, a book page and the graph. In devtools run `[...document.querySelectorAll("header,nav,main,footer")].filter(e => e.offsetParent).map(e => e.tagName)`. Expected: one each of `HEADER`, `NAV` and `MAIN`, plus `FOOTER` on screens that show the footer. Stacked screens are kept mounted with `display: none`, which removes them from the accessibility tree. Then click into a book and use the header back button: it should still return to Home, and the header should look unchanged.
- [ ] **Step 5: Verify on native** (iOS simulator or Android). The header, title, back button and header actions should look and behave exactly as before. Run `npm run typecheck`.
- [ ] **Step 6: Commit:** `git commit -m "feat(app): ARIA landmarks for header, navigation, main and footer"`

### Task 3: WAVE underlined-text alerts (item 6)

WAVE raises "Underlined text" when underlined text isn't an `<a href>`. React-native-web renders our links as `<div role="link">`, with no `href`, and the author names on the book and work pages are `role="button"` but styled as underlined links. The likely answer to item 6 is that this is mostly a WAVE false positive, plus one real mismatch: the author names. Step 1 confirms that before anything changes.

**Files:**
- Modify: `apps/app/app/book/[isbn].tsx:174`, `apps/app/app/work/[id].tsx` (the author `Pressable`, about line 152). Other files only if Step 1 finds them.

- [ ] **Step 1: Reproduce.** With the web build running, run WAVE on Home, a book page, a work page, the Open Library account page and Settings. For each "Underlined text" alert, record the element, its `role`, and whether it is visibly underlined.
- [ ] **Step 2: Apply the rule to each flagged element.**
  - It navigates (to an author or an external site) → it must be `accessibilityRole="link"`. Change the author-name `Pressable`s from `"button"` to `"link"`. Leave the WAVE alert on genuine `role="link"` elements alone: assistive technology announces them as links.
  - It is underlined but isn't a link → remove its `textDecorationLine: "underline"`.
  - It is flagged but not visibly underlined → find the computed `text-decoration` in devtools, and remove the style responsible.
- [ ] **Step 3: Verify.** Run WAVE again on the same pages. The only alerts left should be on `role="link"` elements. Record the before and after list in the commit body.
- [ ] **Step 4: Commit:** `git commit -m "fix(app): author names are links; explain remaining WAVE underline alerts"`

### Task 4: Live-simulation helpers (item 3, pure logic)

**Files:**
- Modify: `apps/app/src/graphLayout.ts`, `apps/app/src/graphLayout.test.ts`

**Interfaces:**
- Produces, all exported from `graphLayout.ts`:
  - `createDragSimulation(nodes: PositionedNode[], edges: PositionedEdge[], size: { width: number; height: number }, centerId: string): Simulation<PositionedNode, undefined>`. It is returned stopped at `alpha(0)`. It applies the same charge, link and collide forces as `layoutGraph`, has **no** `forceCenter`, pins the center node (`fx`/`fy` set to its position), and adds a `"bounds"` force. The bounds force runs last and trims each node's `vx`/`vy` so that `x + vx` and `y + vy` stay inside `clampPoint`'s box.
  - `clampPoint(p: { x: number; y: number }, size: { width: number; height: number }): { x: number; y: number }`. It keeps a node's circle and label inside the content box: x within `[60, width - 60]`, y within `[CENTER_NODE_RADIUS, height - CENTER_NODE_RADIUS - 14 - 3 * LABEL_LINE_HEIGHT]`.
  - `hitNode(points: { x: number; y: number; r: number }[], x: number, y: number): number`. It is a worklet. It returns the index of the last point whose circle contains (x, y), so the node painted on top wins, or `-1`.
  - `entryPositions(final: { x: number; y: number }[], origin: { x: number; y: number }, t: number): { x: number; y: number }[]`. It interpolates each point from `origin` to `final` with ease-out cubic `1 - (1 - t) ** 3`.
  - Exports the existing `placeEdgeLabels` unchanged.
- Refactor: move the charge strength (`-620`), the link-distance expression and the collide radius into module constants and a `linkDistance(nodeCount: number)` helper. Both simulations use them, so tuning stays in one place. `layoutGraph`'s behaviour must not change, and its existing tests must still pass.

- [ ] **Step 1: Write the failing tests** in `graphLayout.test.ts`. Reuse the Frank Herbert fixture, laid out with `layoutGraph(graph, 400, 600)`:

```ts
it("hitNode finds the node under the point, topmost first", () => {
  const pts = [{ x: 0, y: 0, r: 10 }, { x: 5, y: 0, r: 10 }];
  expect(hitNode(pts, 4, 0)).toBe(1);
  expect(hitNode(pts, 50, 50)).toBe(-1);
});
it("clampPoint keeps a point inside the content box", () => {
  expect(clampPoint({ x: -500, y: -500 }, { width: 400, height: 600 })).toEqual({ x: 60, y: CENTER_NODE_RADIUS });
});
it("entryPositions starts at the origin, ends at the layout, eases out", () => {
  const final = [{ x: 100, y: 0 }];
  expect(entryPositions(final, { x: 0, y: 0 }, 0)).toEqual([{ x: 0, y: 0 }]);
  expect(entryPositions(final, { x: 0, y: 0 }, 1)).toEqual([{ x: 100, y: 0 }]);
  expect(entryPositions(final, { x: 0, y: 0 }, 0.5)[0].x).toBeCloseTo(87.5);
});
it("dragging a node pulls its neighbour along and never moves the center", () => {
  const g = { ...graph, edges: [...graph.edges, { source: "work:OL0W", target: "work:OL1W", relation: "sequel" }] };
  const { nodes, edges, contentWidth: width, contentHeight: height } = layoutGraph(g, 400, 600);
  const sim = createDragSimulation(nodes, edges, { width, height }, g.centerId);
  const center = nodes.find((n) => n.id === g.centerId)!;
  const dragged = nodes.find((n) => n.id === "work:OL0W")!;
  const neighbour = nodes.find((n) => n.id === "work:OL1W")!;
  const before = { cx: center.x, cy: center.y, nx: neighbour.x };
  const dir = Math.sign(dragged.x - before.nx) || 1; // drag away from the neighbour
  Object.assign(dragged, clampPoint({ x: dragged.x + dir * 200, y: dragged.y }, { width, height }));
  dragged.fx = dragged.x; dragged.fy = dragged.y;
  sim.alpha(1); sim.tick(100);
  expect([center.x, center.y]).toEqual([before.cx, before.cy]);
  expect((neighbour.x - before.nx) * dir).toBeGreaterThan(0);
});
it("keeps every node inside the content box after a drag to the corner", () => {
  const { nodes, edges, contentWidth: width, contentHeight: height } = layoutGraph(graph, 400, 600);
  const sim = createDragSimulation(nodes, edges, { width, height }, graph.centerId);
  const n = nodes[1];
  Object.assign(n, clampPoint({ x: -500, y: -500 }, { width, height }));
  n.fx = n.x; n.fy = n.y;
  sim.alpha(1); sim.tick(300);
  n.fx = n.fy = null;
  while (sim.alpha() >= sim.alphaMin()) sim.tick();
  for (const p of nodes) expect(clampPoint(p, { width, height })).toEqual({ x: p.x, y: p.y });
});
```

`PositionedNode` needs optional `fx?: number | null; fy?: number | null` (d3's `SimulationNodeDatum` fields). Add them to the interface.

- [ ] **Step 2: Run** `npx vitest run src/graphLayout.test.ts`. Expected: the new tests FAIL with "not a function". The existing tests still PASS.
- [ ] **Step 3: Implement** the four functions, the constants refactor, and the `placeEdgeLabels` export.
- [ ] **Step 4: Run the tests again.** Expected: all PASS. Then run `npm run typecheck`.
- [ ] **Step 5: Commit:** `git commit -m "feat(app): live d3-force drag simulation helpers"`

### Task 5: Animate and drag the graph (item 3, wiring)

**Files:**
- Create: `apps/app/src/useGraphMotion.ts`, `apps/app/src/useGraphMotion.test.ts` (tests the pure `shouldSuppressPress` only)
- Modify: `apps/app/app/graph/[type]/[id].tsx`: the render reads positions from the hook; changes to `panGesture` (lines 244–259) and `handleNodePress` (line 311)

**Interfaces:**
- Consumes: everything Task 4 produces, plus `layoutGraph`'s return type (`ReturnType<typeof layoutGraph>`).
- Produces:
  - `useGraphMotion(layout: ReturnType<typeof layoutGraph> | null, centerId: string | undefined): { nodes: PositionedNode[]; edges: LabeledEdge[]; points: SharedValue<{ x: number; y: number; r: number }[]>; dragStart(index: number): void; dragMove(index: number, x: number, y: number): void; dragEnd(index: number): void; lastDragEnd: () => number }`
  - `shouldSuppressPress(lastDragEndMs: number, nowMs: number): boolean`, which is true when `nowMs - lastDragEndMs < 250`.

**The hook's behaviour:**
- **When `layout` changes.** Stop any previous simulation and animation frame. Build `createDragSimulation(layout.nodes, layout.edges, { width: layout.contentWidth, height: layout.contentHeight }, centerId)`. Unless `useReducedMotion()` is true, animate node `x`/`y` with `entryPositions(final, centerNode, t)` over 600 ms using `requestAnimationFrame`. The nodes are the same objects d3 mutates.
- **Re-render on each tick.** Every simulation tick or animation frame bumps a `frame` counter in state. `edges` is `useMemo(() => placeEdgeLabels(nodes, layout.edges, centerId), [frame, layout])`. `points.value` is refreshed from the nodes on every frame, with `r` set to `CENTER_NODE_RADIUS` for the center node and `NODE_RADIUS` for the rest.
- **`dragStart`** sets `alphaTarget(0.15)` and calls `restart()`. **`dragMove`** sets `fx`/`fy` from `clampPoint`.
- **`dragEnd`** records `Date.now()`. For a non-center node, it clears `fx`/`fy`; the center node keeps its new pin. Then it sets `alphaTarget(0)`. Under reduced motion, it stops the simulation and ticks it synchronously until `alpha < alphaMin`, then bumps `frame` once.
- **On unmount** it stops the simulation and cancels any animation frame.
- Add `// shortcut: re-renders the whole screen per tick; extract the Svg canvas into a memo component if large graphs stutter on device.`

**Screen changes:**
- The Svg layer, the overlay `Pressable`s and `orderedNodes` read `motion.nodes` and `motion.edges` instead of `layout.nodes` and `layout.edges`. `centerNode`, `resetView` and the content size keep using `layout`.
- `panGesture` gets a shared `dragIndex` (`-1` by default).
  - In `.onBegin(e)`, convert to canvas coordinates: `cx = (e.x - translateX.value) / scale.value`, and the same for `y`. Then `dragIndex.value = hitNode(points.value, cx, cy)`.
  - In `.onStart`, if `dragIndex.value >= 0`, call `runOnJS(dragStart)(i)`. Otherwise record the pan start as today.
  - In `.onUpdate`, if `dragIndex.value >= 0`, call `runOnJS(dragMove)(i, cx, cy)`, with `cx`/`cy` from `e.x`/`e.y`. Otherwise pan as today.
  - In `.onFinalize`, if `dragIndex.value >= 0` and the gesture had started, call `runOnJS(dragEnd)(i)`. Then reset to `-1`.
- `handleNodePress` returns early when `shouldSuppressPress(motion.lastDragEnd(), Date.now())`, with the comment `// A drag released over its own node fires a press on web.`
- Change the hint text (line 381) to: "Each circle is a book, author or subject. Tap one to move there, drag it to rearrange, or tap the center circle to open its page."

- [ ] **Step 1: Write the failing test** `src/useGraphMotion.test.ts`:

```ts
it("suppresses a press right after a drag", () => expect(shouldSuppressPress(1000, 1100)).toBe(true));
it("allows a press well after a drag", () => expect(shouldSuppressPress(1000, 1300)).toBe(false));
it("allows a press when nothing was dragged", () => expect(shouldSuppressPress(0, Date.now())).toBe(false));
```

- [ ] **Step 2: Run** `npx vitest run src/useGraphMotion.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `useGraphMotion.ts` (keep the pure function at the top, so the test imports it without loading React Native), then wire up the screen.
- [ ] **Step 4: Run** `npx vitest run` and `npm run typecheck`. Expected: all pass.
- [ ] **Step 5: Manual check on web,** covering each Review Focus case:
  - Opening a graph, nodes spread out from the center and settle.
  - Dragging a node makes its neighbours follow. On release it eases back, and the graph neither re-centers nor navigates.
  - Dragging off the empty canvas still pans, and pinch, wheel zoom and double-tap still zoom.
  - A plain tap on a node still re-centers.
  - Dragging a node into the corner keeps it fully visible.
  - Changing the filter in the middle of the animation shows no flicker of the old graph and no console errors.
  - With macOS "Reduce motion" on, the graph appears without the entry animation.
- [ ] **Step 6: Manual check on a device** (Android if possible), on a busy subject graph with 40 or more nodes. Dragging should stay responsive. If it doesn't, extract the canvas as the `shortcut:` note says and check again.
- [ ] **Step 7: Commit:** `git commit -m "feat(app): drag graph nodes and animate the layout settling"`

### Task 6: English cover for a work (item 8, server)

Today `getWork` takes the work record's `covers[0]`. That is often a translation's cover, for example the French cover on *Le capital au XXIe siècle*. `getWorkEditions` already reads each edition's `languages` and `covers`. It now also returns the cover of the best-ranked edition labelled English, and `getWork` prefers that cover.

**Files:**
- Modify: `apps/server/src/sources/openLibrary.ts`: `getWorkEditions` (lines 147–189) and `getWork` (lines 204–253)
- Test: `apps/server/src/sources/openLibraryWork.test.ts`

**Interfaces:**
- `getWorkEditions(workId)` now returns `{ editions; englishTitles; englishCoverId: number | null }`. The cover id comes from the first edition, **in `orderEditions` order**, whose `languages` includes `/languages/eng` and that has a positive cover id. Track `english` and `coverId` on the internal edition objects, and strip them before returning, as `nonEnglish` is today. Editions with no language label don't count: they might be translations.
- `getWork`: `const coverId = englishCoverId ?? data.covers?.find((c) => c > 0)`. The URL format stays `-L.jpg`. Update the error and `withEditions: false` fallbacks to `englishCoverId: null`. The `OpenLibraryWork` shape doesn't change, so `workService` needs no edit. Its Hardcover fallback (`ol.coverUrl ?? hc?.coverUrl`) still applies when both are missing.

- [ ] **Step 1: Write the failing tests.** Extend `mockWork(title, editions, workCovers?: number[])`: add `covers?: number[]` to each edition entry, and return `{ title, covers: workCovers }` for the work URL. Then add `describe("getWork's cover")`:

```ts
const L = (id: number) => `https://covers.openlibrary.org/b/id/${id}-L.jpg`;
it("prefers an English edition's cover over the work's first cover", async () => {
  mockWork("Le capital au XXIe siècle", [
    { title: "Le capital au XXIe siècle", languages: ["fre"], covers: [111] },
    { title: "Capital in the Twenty-First Century", languages: ["eng"], covers: [222] },
  ], [111]);
  expect((await getWork("OL16814568W"))?.coverUrl).toBe(L(222));
});
it("skips English editions without a cover", async () => {
  mockWork("X", [{ title: "X", languages: ["eng"] }, { title: "X", languages: ["eng"], covers: [-1, 333] }], [111]);
  expect((await getWork("OL1W"))?.coverUrl).toBe(L(333));
});
it("keeps the work's cover when no English edition has one", async () => {
  mockWork("Les Misérables", [{ title: "Les Misérables", languages: ["fre"], covers: [444] }, { title: "Les Miserables", covers: [555] }], [111]);
  expect((await getWork("OL1W"))?.coverUrl).toBe(L(111));
});
it("keeps the work's cover when editions aren't fetched", async () => {
  mockWork("X", [{ title: "X", languages: ["eng"], covers: [222] }], [111]);
  expect((await getWork("OL1W", { editions: false }))?.coverUrl).toBe(L(111));
});
```

- [ ] **Step 2: Run** `cd apps/server && npx vitest run src/sources/openLibraryWork.test.ts`. Expected: the first two new tests FAIL, with `111` returned instead. The title tests still PASS.
- [ ] **Step 3: Implement** the changes listed under Interfaces.
- [ ] **Step 4: Run** the same file, then the whole server suite (`npx vitest run`) and `npm run typecheck` in `apps/server`. Expected: all pass. Existing callers of `orderEditions` and `getWork` (the graph and work links) don't change.
- [ ] **Step 5: Manual check.** Open `/work/OL16814568W` (*Capital in the Twenty-First Century*) in the app. It should show an English cover. The work cache (`workService.ts:10`) has a one-hour TTL, so restart the server or wait an hour to see the change; no cache version bump is needed because the shape is unchanged.
- [ ] **Step 6: Commit:** `git commit -m "feat(server): prefer an English edition's cover for a work"`

---

## Item 3's question: other possible improvements (not in this plan)

Ask the owner which, if any, to plan next:
- **Highlight the dragged or hovered node's edges and neighbours** and dim the rest. Cheap with the hook in place, and it helps in dense subject graphs.
- **Keep dropped nodes pinned** (double-tap to release), for users who want to arrange a graph by hand.
- **Animate re-centering from the old positions** instead of from the center, so moving between graphs feels continuous. This needs a shared coordinate frame across layouts.
- **Run the initial layout off the main thread** for 60+ node graphs, if the device check shows the synchronous 300 ticks stalling.
- **Make the Svg canvas a memoised component**, which is the `shortcut:` in Task 5, so ticks don't re-render the toolbar, list and modal.
