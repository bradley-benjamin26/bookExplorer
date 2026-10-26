import type { Graph, GraphNode } from "@book-explorer/shared";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from "d3-force";
import { RELATION_LABELS } from "./graphLabels";
import { titleCase } from "./titleCase";

export const NODE_RADIUS = 26;
export const CENTER_NODE_RADIUS = 34;
const SIMULATION_TICKS = 300;
const LABEL_MAX_CHARS_PER_LINE = 16;
const LABEL_MAX_LINES = 3;
export const LABEL_LINE_HEIGHT = 15;

// SvgText has no built-in wrapping, so a long node label (an author's full
// name, a multi-word subject) is greedily broken into lines here instead of
// being cut short with a mid-word ellipsis. Capped at LABEL_MAX_LINES so a
// pathologically long label still can't grow the label taller than the
// space between nodes — the last line gets an ellipsis instead of overflowing.
export function wrapLabel(label: string): string[] {
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

export function shortenEdge(source: PositionedNode, target: PositionedNode, sourceRadius: number, targetRadius: number) {
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

export const PILL_HEIGHT = 16;
const PILL_CHAR_WIDTH = 6.6;
const PILL_PADDING = 12;

const LABEL_CHAR_WIDTH = 7.3; // ~0.56em of the 13px node label font
export const labelWidthOf = (lines: string[]) => Math.max(...lines.map((l) => l.length), 1) * LABEL_CHAR_WIDTH + 4;

// What a node occupies on the canvas: its circle plus the wrapped label under it.
function nodeRects(node: { x: number; y: number; label: string }, radius: number): Box[] {
  const lines = wrapLabel(node.label);
  const labelWidth = labelWidthOf(lines);
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
  const half = Math.max(radius, labelWidthOf(lines) / 2);
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

export interface PositionedNode extends GraphNode {
  x: number;
  y: number;
}

export interface PositionedEdge {
  source: PositionedNode;
  target: PositionedNode;
  relation: string;
}

export type LabeledEdge = PositionedEdge & { text: string; pillWidth: number; labelX: number; labelY: number };

// The lines-and-labels a sighted user reads visually (source, connecting
// line, relation label, target) have no equivalent for a screen reader
// landing on one node in isolation, so each node's accessible description
// spells out every edge touching it using the same "source relation target"
// phrasing the diagram itself uses.
export function describeNodeRelations(nodeId: string, edges: LabeledEdge[]): string {
  return edges
    .filter((edge) => edge.source.id === nodeId || edge.target.id === nodeId)
    .map((edge) => `${edge.source.label} ${RELATION_LABELS[edge.relation] ?? edge.relation} ${edge.target.label}`)
    .join(". ");
}

export interface Center {
  type: GraphNode["type"];
  id: string;
}

/** Runs d3-force synchronously to a resting layout, rather than animating it — the
 * graphs here are small (well under 50 nodes) so a few hundred ticks converge instantly. */
export function layoutGraph(graph: Graph, width: number, height: number) {
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
