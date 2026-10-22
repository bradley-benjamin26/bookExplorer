import { useQuery } from "@tanstack/react-query";
import type { Graph, GraphNode } from "@book-explorer/shared";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from "d3-force";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Maximize, ZoomIn, ZoomOut } from "lucide-react-native";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Line, Rect, Text as SvgText } from "react-native-svg";
import { fetchGraph, type GraphCenterType } from "../../../src/api/client";
import { ErrorState } from "../../../src/components/ErrorState";
import { OfflineBanner } from "../../../src/components/OfflineBanner";
import { routes } from "../../../src/navigation";
import { CONTENT_MAX_WIDTH, useTheme, useThemedStyles, type Theme, type ThemeColors } from "../../../src/theme";
import { titleCase } from "../../../src/titleCase";

function nodeColors(colors: ThemeColors): Record<GraphNode["type"], string> {
  return {
    author: colors.graphAuthor,
    work: colors.graphWork,
    subject: colors.graphSubject,
    // Matches the Genres chip color on the book/work detail pages, so a
    // genre reads as the same kind of thing whether it's a chip or a node.
    genre: colors.graphGenre,
    // The same color this node's destination — the Editions section's own
    // highlight — uses on the work page, so the two visibly read as the
    // same thing rather than an arbitrary extra graph color.
    editions: colors.warning,
  };
}

const NODE_LABELS: Record<GraphNode["type"], string> = {
  author: "Author",
  work: "Book",
  subject: "Subject",
  genre: "Genre",
  editions: "Editions",
};

// Each edge already reads correctly as "source <label> target" — direction
// is baked in when the server builds it (e.g. "influencedBy" always means
// the source was influenced by the target, regardless of which way that
// reads on Wikidata) — so the label just needs to name the relationship.
const RELATION_LABELS: Record<string, string> = {
  influencedBy: "influenced by",
  notableWork: "wrote",
  wrote: "wrote",
  wroteAs: "wrote (pen name)",
  author: "wrote",
  movement: "movement",
  subject: "about",
  genre: "is",
  hasBook: "includes",
  broader: "broader topic",
  editions: "has",
};

const NODE_RADIUS = 26;
const CENTER_NODE_RADIUS = 34;
const SIMULATION_TICKS = 300;
const LABEL_MAX_CHARS_PER_LINE = 16;
const LABEL_MAX_LINES = 3;
const LABEL_LINE_HEIGHT = 12;

// How far the user can zoom in/out, and the scale window over which relation
// labels fade in — below MIN they're fully transparent (too crowded to read,
// and the loosened layout below hasn't given them room yet), fully opaque by
// LABEL_FADE_IN_SCALE so a quick pinch past that point doesn't feel laggy.
const MIN_SCALE = 0.25;
const MAX_SCALE = 3;
const LABEL_FADE_OUT_SCALE = 1.0;
const LABEL_FADE_IN_SCALE = 1.3;
// Plain scroll-to-zoom (no modifier key) matches common map/canvas
// conventions on web, where there's no pinch gesture from a trackpad/mouse.
const WHEEL_ZOOM_SPEED = 0.0015;
const DOUBLE_TAP_ZOOM_STEP = 1.5;

const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedSvgText = Animated.createAnimatedComponent(SvgText);

// SvgText has no built-in wrapping, so a long node label (an author's full
// name, a multi-word subject) is greedily broken into lines here instead of
// being cut short with a mid-word ellipsis. Capped at LABEL_MAX_LINES so a
// pathologically long label still can't grow the label taller than the
// space between nodes — the last line gets an ellipsis instead of overflowing.
function wrapLabel(label: string): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > LABEL_MAX_CHARS_PER_LINE && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  if (lines.length <= LABEL_MAX_LINES) return lines;
  const truncated = lines.slice(0, LABEL_MAX_LINES);
  truncated[LABEL_MAX_LINES - 1] = `${truncated[LABEL_MAX_LINES - 1]}…`;
  return truncated;
}

// Edges stop 1px inside each node's circle (nodes are painted after edges)
// so a line visibly meets its node instead of leaving a gap.
const EDGE_GAP = -1;

function shortenEdge(source: PositionedNode, target: PositionedNode, sourceRadius: number, targetRadius: number) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  return {
    x1: source.x + ux * (sourceRadius + EDGE_GAP),
    y1: source.y + uy * (sourceRadius + EDGE_GAP),
    x2: target.x - ux * (targetRadius + EDGE_GAP),
    y2: target.y - uy * (targetRadius + EDGE_GAP),
  };
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const rectsOverlap = (a: Box, b: Box) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

const PILL_HEIGHT = 16;
const PILL_CHAR_WIDTH = 5.2;
const PILL_PADDING = 12;

// What a node occupies on the canvas: its circle plus the wrapped label under it.
function nodeRects(node: { x: number; y: number; label: string }, radius: number): Box[] {
  const lines = wrapLabel(node.label);
  const labelWidth = Math.max(...lines.map((l) => l.length), 1) * 6.2 + 4;
  return [
    { left: node.x - radius - 2, right: node.x + radius + 2, top: node.y - radius - 2, bottom: node.y + radius + 2 },
    {
      left: node.x - labelWidth / 2,
      right: node.x + labelWidth / 2,
      top: node.y + radius + 2,
      bottom: node.y + radius + 14 + lines.length * LABEL_LINE_HEIGHT,
    },
  ];
}

// A relation label sits on its edge, but in a dense star layout the edge's
// midpoint is often right on top of another node or its text, or another
// edge's label. Slides each label along its edge (nearest-to-middle first)
// to the first spot that overlaps none of those, and falls back to the
// midpoint if the whole edge is crowded.
function placeEdgeLabels(nodes: PositionedNode[], edges: PositionedEdge[], centerId: string) {
  const obstacles = nodes.flatMap((n) => nodeRects(n, n.id === centerId ? CENTER_NODE_RADIUS : NODE_RADIUS));
  const placed: Box[] = [];

  return edges.map((edge) => {
    const text = RELATION_LABELS[edge.relation] ?? edge.relation;
    const width = text.length * PILL_CHAR_WIDTH + PILL_PADDING;
    const at = (t: number) => ({
      x: edge.source.x + (edge.target.x - edge.source.x) * t,
      y: edge.source.y + (edge.target.y - edge.source.y) * t,
    });
    const boxAt = (p: { x: number; y: number }): Box => ({
      left: p.x - width / 2,
      right: p.x + width / 2,
      top: p.y - PILL_HEIGHT / 2,
      bottom: p.y + PILL_HEIGHT / 2,
    });

    let chosen = at(0.5);
    for (let i = 0; i <= 12; i++) {
      const t = 0.5 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.05;
      const box = boxAt(at(t));
      if (![...obstacles, ...placed].some((o) => rectsOverlap(box, o))) {
        chosen = at(t);
        break;
      }
    }
    placed.push(boxAt(chosen));
    return { ...edge, text, pillWidth: width, labelX: chosen.x, labelY: chosen.y };
  });
}

// Distance from point (px, py) to the segment a-b, and the unit vector from the segment toward the point.
function segmentOffset(a: { x: number; y: number }, b: { x: number; y: number }, px: number, py: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy || 1)));
  const ox = px - (a.x + dx * t);
  const oy = py - (a.y + dy * t);
  const dist = Math.hypot(ox, oy) || 1;
  return { dist, ux: ox / dist, uy: oy / dist };
}

// A star layout routinely puts a nearer node directly on the line to a
// farther one, so that line runs through the nearer node's circle or name.
// For each edge, this pushes any other node whose circle or name it crosses
// sideways until it clears, over a few passes so one nudge can't
// reintroduce a crossing elsewhere for long.
const EDGE_CLEARANCE = 10;
function nudgeNodesOffEdges(nodes: PositionedNode[], edges: PositionedEdge[], centerId: string) {
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (const edge of edges) {
      for (const node of nodes) {
        if (node.id === edge.source.id || node.id === edge.target.id || node.id === centerId) continue;
        const radius = node.id === centerId ? CENTER_NODE_RADIUS : NODE_RADIUS;
        // Probe the circle's center and the middle of the name below it.
        const lines = wrapLabel(node.label).length;
        const probes = [
          { x: node.x, y: node.y, need: radius + EDGE_CLEARANCE },
          { x: node.x, y: node.y + radius + 14 + (lines * LABEL_LINE_HEIGHT) / 2, need: 34 + EDGE_CLEARANCE },
        ];
        for (const probe of probes) {
          const { dist, ux, uy } = segmentOffset(edge.source, edge.target, probe.x, probe.y);
          if (dist >= probe.need) continue;
          const push = probe.need - dist + 1;
          node.x += ux * push;
          node.y += uy * push;
          moved = true;
          break;
        }
      }
    }
    if (!moved) return;
  }
}

// The space a node needs on the canvas: its circle, plus the wrapped name under it.
function nodeBox(node: PositionedNode, centerId: string): Box {
  const radius = node.id === centerId ? CENTER_NODE_RADIUS : NODE_RADIUS;
  const lines = wrapLabel(node.label);
  const half = Math.max(radius, (Math.max(...lines.map((l) => l.length), 1) * 6.2 + 4) / 2);
  return {
    left: node.x - half,
    right: node.x + half,
    top: node.y - radius,
    bottom: node.y + radius + 14 + lines.length * LABEL_LINE_HEIGHT,
  };
}

// The force simulation spaces nodes by a circle, but a node is a circle plus a
// wide name, so crowded graphs (a subject with 50+ neighbors) still end up
// with nodes sitting on each other's names. This pushes any two overlapping
// boxes apart along the shallower axis, never moving the center node.
const NODE_GAP = 8;
function separateNodes(nodes: PositionedNode[], centerId: string) {
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const boxA = nodeBox(a, centerId);
        const boxB = nodeBox(b, centerId);
        const overlapX = Math.min(boxA.right, boxB.right) - Math.max(boxA.left, boxB.left) + NODE_GAP;
        const overlapY = Math.min(boxA.bottom, boxB.bottom) - Math.max(boxA.top, boxB.top) + NODE_GAP;
        if (overlapX <= 0 || overlapY <= 0) continue;

        const aFixed = a.id === centerId;
        const bFixed = b.id === centerId;
        const share = aFixed || bFixed ? 1 : 0.5;
        // Push along the axis needing the least movement, away from each other.
        if (overlapX < overlapY) {
          const dir = a.x <= b.x ? -1 : 1;
          if (!aFixed) a.x += dir * overlapX * share;
          if (!bFixed) b.x -= dir * overlapX * share;
        } else {
          const dir = a.y <= b.y ? -1 : 1;
          if (!aFixed) a.y += dir * overlapY * share;
          if (!bFixed) b.y -= dir * overlapY * share;
        }
        moved = true;
      }
    }
    if (!moved) return;
  }
}

interface PositionedNode extends GraphNode {
  x: number;
  y: number;
}

interface PositionedEdge {
  source: PositionedNode;
  target: PositionedNode;
  relation: string;
}

type LabeledEdge = PositionedEdge & { text: string; pillWidth: number; labelX: number; labelY: number };

// The lines-and-labels a sighted user reads visually (source, connecting
// line, relation label, target) have no equivalent for a screen reader
// landing on one node in isolation, so each node's accessible description
// spells out every edge touching it using the same "source relation target"
// phrasing the diagram itself uses.
function describeNodeRelations(nodeId: string, edges: LabeledEdge[]): string {
  return edges
    .filter((edge) => edge.source.id === nodeId || edge.target.id === nodeId)
    .map((edge) => `${edge.source.label} ${RELATION_LABELS[edge.relation] ?? edge.relation} ${edge.target.label}`)
    .join(". ");
}

interface Center {
  type: GraphNode["type"];
  id: string;
}

/** Runs d3-force synchronously to a resting layout, rather than animating it — the
 * graphs here are small (well under 50 nodes) so a few hundred ticks converge instantly. */
function layoutGraph(graph: Graph, width: number, height: number) {
  // Subject/genre terms come in mixed case from their sources; person and work names are left as written.
  const nodes = graph.nodes.map((n) => ({
    ...n,
    label: n.type === "subject" || n.type === "genre" ? titleCase(n.label) : n.label,
  })) as (GraphNode & { x: number; y: number })[];
  // The server can report the same author→work link under more than one
  // relation name (e.g. "wrote" and "notableWork") — drawn as-is that's two
  // parallel lines and two identical pills per pair, so collapse by pair + label.
  const seen = new Set<string>();
  const links = graph.edges
    .filter((e) => {
      const key = [[e.source, e.target].sort().join("|"), RELATION_LABELS[e.relation] ?? e.relation].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((e) => ({ ...e }));

  const simulation = forceSimulation(nodes as never[])
    // Pushed apart harder, and linked further apart, than the tighter
    // defaults this started with — worth it for legibility even on the
    // busiest graphs (an author's full bibliography can be 20+ nodes), now
    // that pinch/pan (not a fitted canvas) is how the user sees it all.
    // Tuned against a dense "travel"-style subject graph (15+ related
    // concepts) so adjacent node labels never visually touch at the
    // fully-zoomed-out scale.
    .force("charge", forceManyBody().strength(-620))
    .force(
      "link",
      forceLink(links as never[])
        .id((d) => (d as GraphNode).id)
        .distance(260 * Math.min(2, Math.max(1, Math.sqrt(nodes.length / 20))))
    )
    .force("center", forceCenter(width / 2, height / 2))
    // Padded enough to clear a full 3-line wrapped label below a node (see
    // wrapLabel), not just the circle itself — otherwise two nodes placed
    // close together can end up with one's label overlapping the node below it.
    .force("collide", forceCollide(NODE_RADIUS + 16 + LABEL_MAX_LINES * LABEL_LINE_HEIGHT))
    .stop();

  for (let i = 0; i < SIMULATION_TICKS; i++) simulation.tick();

  // d3-force should always leave every node with finite x/y after ticking,
  // but a node that failed to resolve into forceLink's id map (e.g. a
  // malformed edge slipping past the server's own de-dup) is left with NaN
  // coordinates instead of throwing — passing NaN into <Circle>/<Line> as a
  // web SVG attribute crashes react-native-svg's renderer, so such nodes are
  // dropped here rather than trusting the simulation output blindly.
  const isFinitePoint = (n: { x: number; y: number }) => Number.isFinite(n.x) && Number.isFinite(n.y);
  const positionedNodes = (nodes as PositionedNode[]).filter(isFinitePoint);
  // forceLink mutates each link's source/target from an id string into the
  // matching node object once the simulation has run, so they're safe to
  // read directly as positioned nodes here.
  const positionedEdges = (links as unknown as PositionedEdge[]).filter(
    (e) => isFinitePoint(e.source) && isFinitePoint(e.target)
  );

  // Separating nodes can push one onto an edge and vice versa; a few rounds settle both.
  for (let round = 0; round < 3; round++) {
    separateNodes(positionedNodes, graph.centerId);
    nudgeNodesOffEdges(positionedNodes, positionedEdges, graph.centerId);
  }
  separateNodes(positionedNodes, graph.centerId);

  // A busy graph (20+ nodes, spread apart by the charge/link forces above)
  // routinely lands nodes outside the [0, width] x [0, height] box
  // forceCenter aims for — those nodes would otherwise be cropped by the
  // fixed-size graphArea/Svg below. Bounds are measured generously off the
  // largest node radius plus a full wrapped label's height, then everything
  // is shifted so the leftmost/topmost edge sits at 0, and the graph area
  // grows to fit — scrollable, rather than clipped — whenever that's bigger
  // than the viewport it was originally sized for.
  const labelClearance = 14 + LABEL_MAX_LINES * LABEL_LINE_HEIGHT;
  const allPoints = [...positionedNodes, ...positionedEdges.flatMap((e) => [e.source, e.target])];
  // A node's name is wider than its circle, so the horizontal bounds allow for it too.
  const sideClearance = Math.max(CENTER_NODE_RADIUS, 60);
  const minX = allPoints.length ? Math.min(...allPoints.map((n) => n.x - sideClearance)) : 0;
  const minY = allPoints.length ? Math.min(...allPoints.map((n) => n.y - CENTER_NODE_RADIUS)) : 0;
  const maxX = allPoints.length ? Math.max(...allPoints.map((n) => n.x + sideClearance)) : width;
  const maxY = allPoints.length ? Math.max(...allPoints.map((n) => n.y + CENTER_NODE_RADIUS + labelClearance)) : height;

  const offsetX = Math.max(0, -minX);
  const offsetY = Math.max(0, -minY);
  if (offsetX > 0 || offsetY > 0) {
    // Shift each node object once — edges reference these same node objects
    // as their source/target (not copies), so mutating positionedNodes here
    // moves the edges too; iterating allPoints instead would double-apply
    // the offset to any node touched by more than one edge.
    for (const node of positionedNodes) {
      node.x += offsetX;
      node.y += offsetY;
    }
  }

  const contentWidth = Math.max(width, maxX - minX);
  const contentHeight = Math.max(height, maxY - minY);

  return {
    nodes: positionedNodes,
    edges: placeEdgeLabels(positionedNodes, positionedEdges, graph.centerId),
    contentWidth,
    contentHeight,
  };
}

function parseNodeId(id: string): Center {
  const [type, ...rest] = id.split(":");
  return { type: type as GraphNode["type"], id: rest.join(":") };
}

export default function GraphExplorer() {
  const { type, id } = useLocalSearchParams<{ type: string; id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const NODE_COLORS = useMemo(() => nodeColors(theme.colors), [theme.colors]);
  const { width: windowWidth, height } = useWindowDimensions();
  // The screen itself lives inside the app-wide max-width shell (see
  // _layout.tsx) — `useWindowDimensions` reports the full window/device
  // width regardless, so a wide desktop window would otherwise lay the
  // graph out (and size its <Svg> canvas) far wider than what's actually
  // visible, hiding most of it off the edge of the capped content area.
  const width = Math.min(windowWidth, CONTENT_MAX_WIDTH);
  // Clamped so a very short viewport (small split-screen window, landscape
  // phone) can't push this negative, which would hand d3-force and <Svg> a
  // degenerate size instead of just a cramped one.
  // Until the viewport has been measured (below), a rough guess at the space
  // left over by the header, legend and footer; once it has, the real height.
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const canvasHeight = measuredHeight ?? Math.max(height - 140, 300);

  // Tapping a node used to push a whole new screen for its graph. It now
  // re-centers this same screen instead — feels like panning around one
  // continuous map rather than drilling through a stack of pages — with
  // `history` as a small in-screen back-stack so a "Back" affordance can
  // still step outward one ring at a time. Only entering the graph fresh
  // (e.g. the "View as Graph" button elsewhere) is a real navigation.
  const [center, setCenter] = useState<Center | null>(type && id ? { type: type as GraphNode["type"], id } : null);
  const [history, setHistory] = useState<Center[]>([]);

  const { data, isLoading, isError, error, dataUpdatedAt } = useQuery({
    queryKey: ["graph", center?.type, center?.id],
    // Never actually "genre" here — routes.graph() (the only way center gets
    // set from outside) and handleNodePress below (the only way it gets set
    // from within) both only ever produce author/work/subject centers, but
    // Center's own `type` stays the full GraphNode type since it's also used
    // for genre *nodes* passing through parseNodeId before that check runs.
    queryFn: () => fetchGraph(center!.type as GraphCenterType, center!.id),
    enabled: !!center,
  });

  const layout = useMemo(() => {
    if (!data) return null;
    return layoutGraph(data, width, canvasHeight);
  }, [data, width, canvasHeight]);

  // Shared transform for the whole canvas: both the SVG rendering layer and
  // the accessible Pressable overlay are children of one Animated.View (see
  // the render below) carrying this single scale/translate, so a tap lands
  // on the right node at any zoom/pan state without keeping two layers'
  // math independently in sync.
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  // Gesture worklets run off the JS thread and can't close over fresh
  // `layout`/`width`/`canvasHeight` values directly — mirrored into shared
  // values so the pan-clamping math below always reads the current content
  // size without the gesture handlers needing to be torn down and rebuilt
  // every time the graph data (and thus content size) changes.
  const contentWidth = useSharedValue(width);
  const contentHeight = useSharedValue(height);
  const viewportWidth = useSharedValue(width);
  const viewportHeight = useSharedValue(canvasHeight);

  const centerNode = layout?.nodes.find((n) => n.id === data?.centerId);
  useEffect(() => {
    if (!layout || !centerNode) return;
    contentWidth.value = layout.contentWidth;
    contentHeight.value = layout.contentHeight;
    viewportWidth.value = width;
    viewportHeight.value = canvasHeight;
    // Re-centering on a new node (tap-to-recenter) or arriving fresh should
    // bring that center node into view rather than leaving the transform
    // wherever the previous graph's pan/zoom left it — the content size and
    // node positions are entirely different after a recenter re-layout.
    resetView();
  }, [data?.centerId, layout?.contentWidth, layout?.contentHeight]);

  // Starts (and, for the reset button, returns to) zoomed out just far enough
  // to show the whole graph — never past MIN_SCALE, never magnified — centered,
  // instead of cropping outer nodes.
  function resetView() {
    if (!layout) return;
    const fit = Math.min(1, width / layout.contentWidth, canvasHeight / layout.contentHeight);
    const initial = Math.max(MIN_SCALE, fit);
    scale.value = initial;
    translateX.value = (width - layout.contentWidth * initial) / 2;
    translateY.value = (canvasHeight - layout.contentHeight * initial) / 2;
    clampTranslation(initial);
  }

  // The buttons zoom about the middle of the viewport, where a pinch or the
  // wheel would zoom about the fingers/cursor.
  const zoomByStep = (factor: number) => zoomAbout(scale.value * factor, width / 2, canvasHeight / 2);

  // The canvas is transformed from its top-left corner (see styles.graphArea),
  // so a canvas point p lands at translate + scale * p on screen. The canvas
  // can't be dragged so far that empty viewport shows beside it (or, when it's
  // smaller than the viewport, so far that it leaves the viewport).
  function clampTranslation(s: number) {
    "worklet";
    const slackX = viewportWidth.value - contentWidth.value * s;
    const slackY = viewportHeight.value - contentHeight.value * s;
    translateX.value = Math.min(Math.max(0, slackX), Math.max(Math.min(0, slackX), translateX.value));
    translateY.value = Math.min(Math.max(0, slackY), Math.max(Math.min(0, slackY), translateY.value));
  }

  // Zooms to `next` while keeping the canvas point under (focalX, focalY)
  // fixed on screen, so zooming goes toward the fingers/cursor instead of
  // drifting toward the canvas's own center.
  function zoomAbout(next: number, focalX: number, focalY: number) {
    "worklet";
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    const ratio = clamped / scale.value;
    translateX.value = focalX - (focalX - translateX.value) * ratio;
    translateY.value = focalY - (focalY - translateY.value) * ratio;
    scale.value = clamped;
    clampTranslation(clamped);
  }

  const pinchStartScale = useSharedValue(1);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      pinchStartScale.value = scale.value;
    })
    .onUpdate((e) => {
      zoomAbout(pinchStartScale.value * e.scale, e.focalX, e.focalY);
    });

  const panGesture = Gesture.Pan()
    // Node taps go through a plain RN Pressable (the accessible overlay),
    // which has no built-in movement tolerance of its own — without a
    // minimum distance here, Pan would steal every tap's initial pixel of
    // movement before the Pressable ever sees a press, so taps would stop
    // working under this gesture detector.
    .minDistance(10)
    .onStart(() => {
      panStartX.value = translateX.value;
      panStartY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateX.value = panStartX.value + e.translationX;
      translateY.value = panStartY.value + e.translationY;
      clampTranslation(scale.value);
    });

  // Trackpad/mouse equivalent for pinch, since Gesture.Pinch() only fires
  // from an actual two-finger touch gesture and react-native-gesture-handler's
  // web Pan handler doesn't surface plain mouse-wheel deltas at all — so this
  // reads the native wheel event directly (ctrl/cmd+scroll or a plain scroll
  // both zoom, matching common web map/canvas conventions). Native platforms
  // have no wheel device and never fire this.
  const handleWheel = (e: { deltaY: number; clientX: number; clientY: number; currentTarget: unknown }) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    zoomAbout(scale.value * (1 - e.deltaY * WHEEL_ZOOM_SPEED), e.clientX - rect.left, e.clientY - rect.top);
  };

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      const next = scale.value >= MAX_SCALE ? MIN_SCALE : scale.value * DOUBLE_TAP_ZOOM_STEP;
      zoomAbout(next, e.x, e.y);
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture);

  const canvasAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));

  // Edge/pill outlines are drawn in canvas units, so zooming would thicken
  // them (and thin them when zoomed out) — dividing by scale keeps their
  // on-screen weight constant.
  const edgeAnimatedProps = useAnimatedProps(() => ({ strokeWidth: 1.25 / scale.value }));
  const pillAnimatedProps = useAnimatedProps(() => ({
    strokeWidth: 1 / scale.value,
    opacity:
      scale.value <= LABEL_FADE_OUT_SCALE
        ? 0
        : scale.value >= LABEL_FADE_IN_SCALE
          ? 1
          : (scale.value - LABEL_FADE_OUT_SCALE) / (LABEL_FADE_IN_SCALE - LABEL_FADE_OUT_SCALE),
  }));
  const labelAnimatedProps = useAnimatedProps(() => ({
    opacity:
      scale.value <= LABEL_FADE_OUT_SCALE
        ? 0
        : scale.value >= LABEL_FADE_IN_SCALE
          ? 1
          : (scale.value - LABEL_FADE_OUT_SCALE) / (LABEL_FADE_IN_SCALE - LABEL_FADE_OUT_SCALE),
  }));

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.cover} />
      </View>
    );
  }

  if (!data || !layout || !center) {
    return <ErrorState message={error instanceof Error ? error.message : `No graph found for ${type}/${id}`} />;
  }

  const handleNodePress = (node: PositionedNode) => {
    if (!node.navigable) return;
    const next = parseNodeId(node.id);

    // Genre nodes have no graph of their own to pan into — a genre is really
    // just an Open Library subject slug wearing a different label and color,
    // and the server only knows how to build a graph for author/work/subject
    // ids — so tapping one always jumps straight to the Subject browse
    // screen instead of joining the recenter-the-graph behavior every other
    // non-center node gets.
    if (next.type === "genre") {
      router.push(routes.subject(next.id));
      return;
    }

    // Likewise has no graph of its own — it's a signpost pointing at the
    // Editions section on its own work's page (see buildWorkGraph), not a
    // real browsable node, so tapping it jumps straight there instead of
    // recentering.
    if (next.type === "editions") {
      router.push(routes.work(next.id, { highlight: "editions" }));
      return;
    }

    if (node.id !== data.centerId) {
      setHistory((h) => [...h, center]);
      setCenter(next);
      return;
    }
    if (next.type === "author") router.push(routes.author(next.id));
    else if (next.type === "subject") router.push(routes.subject(next.id));
    else router.push(routes.work(next.id));
  };

  const handleBack = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      setCenter(h[h.length - 1]);
      return h.slice(0, -1);
    });
  };

  // Screen readers can't derive meaning from an SVG circle's position, so the
  // visual graph is hidden from them entirely and each node instead gets a
  // real accessible button, absolutely positioned over its circle, in the
  // same reading order sighted users would explore outward from the center.
  // A graph with nothing but its own center node happens for a genuinely
  // thin record — an author with no Wikidata relations and no catalogued
  // Open Library works, say — rather than a fetch failure, so it's shown as
  // its own explicit "nothing here" state rather than an empty canvas with
  // a lone floating circle and no explanation.
  if (layout.nodes.length <= 1) {
    const centerLabel = layout.nodes[0]?.label ?? "this";
    return (
      <View style={styles.center}>
        <Text style={styles.emptyGraphText}>No linked connections found for {centerLabel} yet.</Text>
      </View>
    );
  }

  const orderedNodes = [...layout.nodes].sort((a, b) =>
    a.id === data.centerId ? -1 : b.id === data.centerId ? 1 : 0
  );

  return (
    <View style={styles.container}>
      <OfflineBanner show={isError} updatedAt={dataUpdatedAt} />
      <Text style={styles.hint}>
        Tap a node to explore it, or swipe through them with a screen reader — activate the highlighted center node
        for full details.
      </Text>
      <View style={styles.legend}>
        {(Object.keys(NODE_COLORS) as GraphNode["type"][]).map((nodeType) => (
          <View key={nodeType} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: NODE_COLORS[nodeType] }]} />
            <Text style={styles.legendLabel}>{NODE_LABELS[nodeType]}</Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.legendSwatchFaded]} />
          <Text style={styles.legendLabel}>Not yet linked</Text>
        </View>
      </View>
      {history.length > 0 && (
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          hitSlop={8}
        >
          <ChevronLeft size={16} color={theme.colors.cover} strokeWidth={2} />
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
      )}
      <GestureDetector gesture={composedGesture}>
        <View
          style={[styles.viewport, { width }]}
          onLayout={(e) => {
            const h = Math.round(e.nativeEvent.layout.height);
            if (h > 0 && h !== measuredHeight) setMeasuredHeight(h);
          }}
          {...(Platform.OS === "web" ? { onWheel: handleWheel } : null)}
        >
          <Animated.View
            style={[
              styles.graphArea,
              { width: layout.contentWidth, height: layout.contentHeight },
              canvasAnimatedStyle,
            ]}
          >
            <View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Svg width={layout.contentWidth} height={layout.contentHeight}>
            {layout.edges.map((edge, i) => {
              const isSourceCenter = edge.source.id === data.centerId;
              const isTargetCenter = edge.target.id === data.centerId;
              const { x1, y1, x2, y2 } = shortenEdge(
                edge.source,
                edge.target,
                isSourceCenter ? CENTER_NODE_RADIUS : NODE_RADIUS,
                isTargetCenter ? CENTER_NODE_RADIUS : NODE_RADIUS
              );
              return (
                <AnimatedLine
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={theme.colors.thread}
                  animatedProps={edgeAnimatedProps}
                />
              );
            })}
            {layout.edges.map((edge, i) => {
              const { text: label, pillWidth, labelX: midX, labelY: midY } = edge;
              return (
                <Fragment key={i}>
                  <AnimatedRect
                    animatedProps={pillAnimatedProps}
                    x={midX - pillWidth / 2}
                    y={midY - PILL_HEIGHT / 2}
                    width={pillWidth}
                    height={PILL_HEIGHT}
                    rx={PILL_HEIGHT / 2}
                    fill={theme.colors.paper}
                    stroke={theme.colors.thread}
                  />
                  <AnimatedSvgText
                    animatedProps={labelAnimatedProps}
                    x={midX}
                    y={midY + 3}
                    fontSize={9.5}
                    fontFamily={theme.fonts.body}
                    fill={theme.colors.inkFaint}
                    textAnchor="middle"
                  >
                    {label}
                  </AnimatedSvgText>
                </Fragment>
              );
            })}
            {layout.nodes.map((node) => {
              const isCenter = node.id === data.centerId;
              const radius = isCenter ? CENTER_NODE_RADIUS : NODE_RADIUS;
              const lines = wrapLabel(node.label);
              const firstLineY = node.y + radius + 14;
              const opacity = node.navigable ? 1 : 0.4;
              return (
                <Fragment key={node.id}>
                  {/* A soft, slightly-larger dark circle offset downward
                      stands in for a drop shadow — react-native-svg's cross-
                      platform blur support is unreliable, so this fakes the
                      same "resting on the page" depth without it. */}
                  <Circle cx={node.x} cy={node.y + 2} r={radius} fill={theme.colors.ink} opacity={opacity * 0.08} />
                  {isCenter && (
                    <Circle
                      cx={node.x}
                      cy={node.y}
                      r={radius + 5}
                      fill="none"
                      stroke={NODE_COLORS[node.type]}
                      strokeWidth={1}
                      opacity={opacity * 0.3}
                    />
                  )}
                  <Circle
                    cx={node.x}
                    cy={node.y}
                    r={radius}
                    fill={NODE_COLORS[node.type]}
                    opacity={opacity}
                    stroke={theme.colors.paper}
                    strokeWidth={isCenter ? 2.5 : 1.5}
                  />
                  {lines.map((line, i) => (
                    <Fragment key={i}>
                      {/* Paper-colored outline under the text so a line passing behind a label doesn't strike through it. */}
                      <SvgText
                        x={node.x}
                        y={firstLineY + i * LABEL_LINE_HEIGHT}
                        fontSize={11}
                        fontFamily={theme.fonts.bodyMedium}
                        fill={theme.colors.paper}
                        stroke={theme.colors.paper}
                        strokeWidth={3}
                        strokeLinejoin="round"
                        textAnchor="middle"
                      >
                        {line}
                      </SvgText>
                      <SvgText
                        x={node.x}
                        y={firstLineY + i * LABEL_LINE_HEIGHT}
                        fontSize={11}
                        fontFamily={theme.fonts.bodyMedium}
                        fill={theme.colors.ink}
                        textAnchor="middle"
                      >
                        {line}
                      </SvgText>
                    </Fragment>
                  ))}
                </Fragment>
              );
            })}
          </Svg>
        </View>

        {orderedNodes.map((node) => {
          const isCenter = node.id === data.centerId;
          const radius = isCenter ? CENTER_NODE_RADIUS : NODE_RADIUS;
          const relations = describeNodeRelations(node.id, layout.edges);
          const label = [
            `${node.label}, ${NODE_LABELS[node.type]}`,
            isCenter && "currently centered",
            relations,
            !node.navigable && "not yet linked",
          ]
            .filter(Boolean)
            .join(". ");

          return (
            <Pressable
              key={node.id}
              onPress={() => handleNodePress(node)}
              disabled={!node.navigable}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityHint={
                node.navigable
                  ? isCenter
                    ? "Opens full details for this item"
                    : "Re-centers the graph on this item"
                  : undefined
              }
              accessibilityState={{ disabled: !node.navigable, selected: isCenter }}
              style={{
                position: "absolute",
                left: node.x - radius,
                top: node.y - radius,
                width: radius * 2,
                height: radius * 2,
                borderRadius: radius,
              }}
              />
          );
        })}
          </Animated.View>
          <View style={styles.zoomControls}>
            <Pressable
              onPress={() => zoomByStep(DOUBLE_TAP_ZOOM_STEP)}
              accessibilityRole="button"
              accessibilityLabel="Zoom in"
              hitSlop={4}
              style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]}
            >
              <ZoomIn size={20} color={theme.colors.cover} strokeWidth={2} />
            </Pressable>
            <Pressable
              onPress={() => zoomByStep(1 / DOUBLE_TAP_ZOOM_STEP)}
              accessibilityRole="button"
              accessibilityLabel="Zoom out"
              hitSlop={4}
              style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]}
            >
              <ZoomOut size={20} color={theme.colors.cover} strokeWidth={2} />
            </Pressable>
            <Pressable
              onPress={resetView}
              accessibilityRole="button"
              accessibilityLabel="Reset zoom to fit the whole graph"
              hitSlop={4}
              style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]}
            >
              <Maximize size={20} color={theme.colors.cover} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
      </GestureDetector>
    </View>
  );
}

function createStyles({ colors, spacing, radii, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: colors.paper },
    emptyGraphText: { fontFamily: fonts.display, fontSize: typeScale.md, color: colors.ink, textAlign: "center", lineHeight: 28 },
    hint: {
      textAlign: "center",
      fontFamily: fonts.body,
      fontSize: typeScale.xs,
      color: colors.inkFaint,
      paddingVertical: 10,
      paddingHorizontal: spacing.lg,
    },
    legend: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: spacing.lg,
      paddingBottom: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    legendSwatch: { width: 12, height: 12, borderRadius: 6 },
    legendSwatchFaded: { backgroundColor: colors.graphSubject, opacity: 0.4 },
    legendLabel: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint },
    backButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      alignSelf: "center",
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    // overflow: hidden clips the canvas to the visible viewport — now that
    // the canvas is panned/zoomed rather than fitted to the screen, it's
    // routinely larger than this box at 100% scale.
    viewport: { flex: 1, overflow: "hidden" },
    graphArea: { position: "relative", transformOrigin: "top left" },
    zoomControls: { position: "absolute", right: spacing.md, bottom: spacing.md, gap: spacing.sm },
    zoomButton: {
      width: 40,
      height: 40,
      borderRadius: radii.sm,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.paper,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    pressed: { opacity: 0.6 },
    backButtonText: { fontFamily: fonts.bodySemiBold, color: colors.cover, fontSize: 14 },
  });
}
