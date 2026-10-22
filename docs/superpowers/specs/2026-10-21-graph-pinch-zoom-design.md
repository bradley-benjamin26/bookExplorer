# Graph explorer: pinch-to-zoom and pan

## Problem

The graph explorer (`apps/app/app/graph/[type]/[id].tsx`) lays out nodes with
d3-force and renders them as a fixed-scale SVG canvas, panned only via nested
horizontal/vertical `ScrollView`s. In a graph with a high-fanout center node
(e.g. a subject like "travel" with 15+ related concepts and books), relation
labels rendered at each edge's midpoint collide with nearby nodes and with
each other — there is no way to spread the layout out for legibility without
also pushing most of it off-screen, since the only navigation is scrolling at
a single fixed zoom level.

## Goals

- Let the user zoom in/out (pinch, and a reasonable non-touch equivalent) and
  pan freely around the graph canvas.
- Spread the force layout out more than today, now that zooming out gives an
  overview and zooming in gives room to read a crowded area.
- Keep relation labels legible: hidden at the zoomed-out overview, fading in
  once zoomed in enough that they have room.
- Preserve every existing behavior that isn't specifically about spacing/zoom:
  tap-to-recenter on a node, the screen-reader accessible node list, the
  legend, back/history navigation, loading/empty/error states.

## Non-goals

- No change to what the server returns or to `cleanGraph`/`buildXGraph`.
- No change to the tap-a-node interaction model (still recenters + refetches).
- No minimap, no "fit to screen" button, no saved zoom/pan position across
  navigations — all out of scope for this pass.

## Architecture

### Dependencies

Add `react-native-gesture-handler` and `react-native-reanimated` as direct
dependencies of `apps/app` (both are already present transitively via
expo-router's navigation stack, so this pins versions the app actually
imports rather than relying on a transitive resolution). Wrap the app root
(`apps/app/app/_layout.tsx`) in `GestureHandlerRootView` — required once,
app-wide, for any gesture handler to receive touches.

### Shared transform container

Today the canvas is two parallel absolutely-positioned layers at the same
node coordinates:
1. An SVG canvas (`pointerEvents="none"`, hidden from the accessibility tree)
   — the visual rendering.
2. A sibling `View` of `Pressable`s, one per node, at the same `(x, y)` — the
   real tap targets and what a screen reader navigates.

These two layers must stay in exact visual sync under zoom/pan. Rather than
transforming each independently and keeping their math aligned, both become
children of one `Animated.View` that carries a single shared transform:
`scale`, `translateX`, `translateY` as reanimated shared values. A tap lands
correctly at any zoom/pan state for free, since both layers move together.

A `Gesture.Pinch()` updates `scale` (clamped to a fixed range, e.g. 0.4–3×).
A `Gesture.Pan()` updates `translateX`/`translateY` (clamped so the content
can't be dragged entirely off-screen). Composed with `Gesture.Simultaneous()`
so pinch and pan can both be in progress at once (a two-finger
pinch-and-drag), wrapped in `GestureDetector`.

The existing nested horizontal/vertical `ScrollView` panning is removed
entirely — pan gesture replaces it.

On web, `Gesture.Pinch()` doesn't fire from a trackpad/mouse; add
`Gesture.Pan()` with a wheel modifier (ctrl/cmd+scroll, or plain scroll-to-
zoom, matching common web map/canvas conventions) and a double-tap-to-zoom-in
gesture as the non-touch equivalents, both driving the same `scale` value.

### Layout spacing

In `layoutGraph`, loosen `forceManyBody().strength()` and
`forceLink().distance()` so nodes spread further apart than today — tuned by
eye against the existing dense "travel"-style subject graph as the hard case,
targeting enough gap between adjacent node labels that two labels never
visually touch at the default (fully zoomed-out) scale.

The current logic that computes `contentWidth`/`contentHeight` and caps/pads
the canvas to roughly fit the viewport is relaxed: the canvas can legitimately
be larger than the screen at 100% scale now, since zoom/pan — not a fitted
canvas size — is how the user sees the whole thing.

### Label visibility

Relation-label `Rect`/`SvgText` pairs (the pill rendered at
`findClearLabelPoint`) get their `opacity` driven by the shared `scale` value:
fully transparent below a threshold (e.g. `scale < 1.0`), fading in smoothly
above it (e.g. linear ramp from 1.0 to 1.3) rather than a hard show/hide pop.
Below the threshold, only plain connector lines and node circles+labels are
visible.

This also significantly reduces the collision problem `findClearLabelPoint`
was fighting: by the time labels are visible, the looser spacing has given
them more room, and at the zoomed-out view where space is tightest, labels
simply aren't drawn. `findClearLabelPoint`'s node-avoidance logic stays as a
second line of defense for whatever crowding remains at higher zoom.

### What's unchanged

- `handleNodePress` / tap-to-recenter / history back-stack.
- The accessible `Pressable` overlay's button semantics, labels, and reading
  order (`orderedNodes`) — independent of the visual transform.
- The legend, hint text, loading/error/empty states.
- Server-side graph building (`graphService.ts`) and `cleanGraph`.

## Testing

- Existing graph screen tests (if any) continue to pass against the new
  rendering — a snapshot/behavior test that currently asserts on `ScrollView`
  presence will need updating to assert on the gesture container instead.
- New coverage: `layoutGraph`'s spacing change doesn't need a dedicated test
  (it's a tuning constant, not new logic); `findClearLabelPoint` keeps its
  existing behavior and doesn't need new tests for this change.
- Manual verification (per this project's testing conventions — no headless
  RN gesture testing harness in place): pinch/pan on the dense "travel"
  subject graph in a browser (ctrl+scroll to zoom, drag to pan) and on a
  physical/simulated touch device if available, confirming taps still land
  on the correct node at various zoom/pan states.
