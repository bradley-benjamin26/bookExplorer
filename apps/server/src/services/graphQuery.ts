import type { GraphEdge, GraphNode, PathResult } from "@book-explorer/shared";
import { buildAuthorGraph, buildSubjectGraph, buildWorkGraph } from "./graphService.js";

// Each expansion can cost several Open Library/Wikidata calls on a cold cache,
// so the search is bounded on every axis. Depth 4 is unmeasured against real
// latency — see the roadmap's spike note before raising any of these.
export const MAX_PATH_DEPTH = 4;
export const MAX_VISITED_NODES = 300;
export const MAX_EXPANSIONS = 40;
export const PATH_TIME_BUDGET_MS = 8000;
export const MAX_CONCURRENT_EXPANSIONS = 4;

export type Neighbourhood = { nodes: GraphNode[]; edges: GraphEdge[] };
/** The graph one hop out from a node, or null when the node can't be expanded. */
export type Neighbours = (nodeId: string) => Promise<Neighbourhood | null>;

export interface PathLimits {
  maxDepth: number;
  maxVisited: number;
  maxExpansions: number;
  timeBudgetMs: number;
  concurrency: number;
}

const DEFAULT_LIMITS: PathLimits = {
  maxDepth: MAX_PATH_DEPTH,
  maxVisited: MAX_VISITED_NODES,
  maxExpansions: MAX_EXPANSIONS,
  timeBudgetMs: PATH_TIME_BUDGET_MS,
  concurrency: MAX_CONCURRENT_EXPANSIONS,
};

/** Production neighbours: the same cached builders behind /api/graph/:type/:id. */
export const graphNeighbours: Neighbours = async (nodeId) => {
  const sep = nodeId.indexOf(":");
  const type = nodeId.slice(0, sep);
  const id = nodeId.slice(sep + 1);
  // QID-only authors/works and the editions summary have no graph of their own.
  if (id.startsWith("qid:")) return null;
  // A genre opens the same subject browse as a subject of that slug.
  const build = { author: buildAuthorGraph, work: buildWorkGraph, subject: buildSubjectGraph, genre: buildSubjectGraph }[type];
  const graph = await build?.(id);
  if (!graph) return null;
  // The centre can come back under another id (a genre's "subject:", a
  // redirected work), so it's renamed to the id asked for, or the search
  // would never see its edges touch this node.
  const rename = (end: string) => (end === graph.centerId ? nodeId : end);
  return {
    nodes: graph.nodes.map((n) => (n.id === graph.centerId ? { ...n, id: nodeId } : n)),
    edges: graph.edges.map((e) => ({ ...e, source: rename(e.source), target: rename(e.target) })),
  };
};

type Visit = { dist: number; prev: string | null; edge: GraphEdge | null };

// `stopped` lets a search that has already given up stop starting queued items.
async function mapLimit<T, R>(items: T[], limit: number, stopped: () => boolean, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (!stopped() && next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Shortest undirected path between two node ids, by bidirectional BFS over a
 * lazily expanded neighbourhood. Edges keep their original direction so the
 * caller can read each one as "source relation target". `from` and `to` must
 * differ (the route rejects equal ids).
 */
export async function findPath(from: string, to: string, neighbours: Neighbours, limits: PathLimits = DEFAULT_LIMITS): Promise<PathResult> {
  const nodes = new Map<string, GraphNode>();
  const sides = [
    { visits: new Map<string, Visit>([[from, { dist: 0, prev: null, edge: null }]]), frontier: [from], depth: 0 },
    { visits: new Map<string, Visit>([[to, { dist: 0, prev: null, edge: null }]]), frontier: [to], depth: 0 },
  ];
  let expansions = 0;
  let done = false;
  // An upstream failure for one node makes it a dead end, not a failed search.
  const expand = (nodeId: string) =>
    neighbours(nodeId).catch((err) => {
      console.warn(`[graphQuery] Failed to expand ${nodeId}:`, err);
      return null;
    });

  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), limits.timeBudgetMs);
  });

  try {
    for (;;) {
      const [fwd, bwd] = sides;
      if (fwd.frontier.length === 0 || bwd.frontier.length === 0) return { found: false, reason: "noPath" };
      if (fwd.depth + bwd.depth >= limits.maxDepth) return { found: false, reason: "depthCap" };
      if (fwd.visits.size + bwd.visits.size > limits.maxVisited) return { found: false, reason: "nodeCap" };

      const side = fwd.frontier.length <= bwd.frontier.length ? fwd : bwd;
      const other = side === fwd ? bwd : fwd;
      if (expansions + side.frontier.length > limits.maxExpansions) return { found: false, reason: "nodeCap" };
      expansions += side.frontier.length;

      const level = side.frontier;
      const hoods = await Promise.race([mapLimit(level, limits.concurrency, () => done, expand), timedOut]);
      if (hoods === "timeout") return { found: false, reason: "timeout" };

      side.depth++;
      side.frontier = [];
      let meet: string | null = null;
      let best = Infinity;
      level.forEach((nodeId, i) => {
        const hood = hoods[i];
        if (!hood) return;
        for (const n of hood.nodes) if (!nodes.has(n.id)) nodes.set(n.id, n);
        for (const edge of hood.edges) {
          if (edge.source !== nodeId && edge.target !== nodeId) continue;
          const next = edge.source === nodeId ? edge.target : edge.source;
          if (side.visits.has(next)) continue;
          side.visits.set(next, { dist: side.depth, prev: nodeId, edge });
          side.frontier.push(next);
          const across = other.visits.get(next);
          if (across && side.depth + across.dist < best) {
            best = side.depth + across.dist;
            meet = next;
          }
        }
      });

      if (meet) return buildPath(meet, fwd.visits, bwd.visits, nodes);
    }
  } finally {
    done = true;
    clearTimeout(timer);
  }
}

function buildPath(meet: string, fwd: Map<string, Visit>, bwd: Map<string, Visit>, nodes: Map<string, GraphNode>): PathResult {
  const ids = [meet];
  const edges: GraphEdge[] = [];
  for (let v = fwd.get(meet)!; v.prev; v = fwd.get(v.prev)!) {
    ids.unshift(v.prev);
    edges.unshift(v.edge!);
  }
  for (let v = bwd.get(meet)!; v.prev; v = bwd.get(v.prev)!) {
    ids.push(v.prev);
    edges.push(v.edge!);
  }
  // cleanGraph guarantees every edge endpoint has a node in the same graph.
  return { found: true, nodes: ids.map((id) => nodes.get(id)!), edges };
}
