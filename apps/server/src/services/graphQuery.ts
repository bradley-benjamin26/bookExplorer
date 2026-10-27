import type { Graph, GraphEdge, GraphNode, GraphPath, PathResult } from "@book-explorer/shared";
import { buildAuthorLinksGraph, buildSubjectBooksGraph, buildWorkLinksGraph } from "./graphService.js";
import { UpstreamUnavailableError } from "../httpClient.js";

// Measured cold on 2026-10-26, all Open Library calls sharing its 3 requests a
// second: a work ~1 s, a subject's book list ~2 s, an author ~2.5 s, so 38-62
// expansions in the 25 s budget (~1.5-2.5 a second); a search through one
// author's books reached 80 in 16 s. A retry starts warm and reaches the cap
// in under 10 s, so the cap stays above the cold rate rather than at it. The
// visited cap allows ~15 new nodes per expansion. Depth 4 covers
// author -> other work -> subject <- target.
export const MAX_PATH_DEPTH = 4;
export const MAX_VISITED_NODES = 1200;
export const MAX_EXPANSIONS = 80;
export const PATH_TIME_BUDGET_MS = 25_000;
export const MAX_CONCURRENT_EXPANSIONS = 4;
export const MAX_PATHS = 3;

// Path cost = HOP_COST per edge + log10(1 + workCount) for each subject or
// genre passed through, so a hop through "Fiction" (~10^6 works) costs as
// much as several hops through people and books, and the most specific
// chain ranks first. A subject not yet fetched is guessed at ~1000 works.
const HOP_COST = 1;
const UNPROBED_SUBJECT_PENALTY = 3;

export type Neighbourhood = { nodes: GraphNode[]; edges: GraphEdge[]; workCount?: number };
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

/**
 * Production neighbours: the cached builders behind /api/graph/:type/:id,
 * except that subjects and genres give only their books and work count, and
 * works and authors skip the lookups their pages need but the links don't.
 */
export const graphNeighbours: Neighbours = async (nodeId) => {
  const sep = nodeId.indexOf(":");
  const type = nodeId.slice(0, sep);
  const id = nodeId.slice(sep + 1);
  // QID-only authors/works and the editions summary have no graph of their own.
  if (id.startsWith("qid:")) return null;
  // A genre opens the same subject browse as a subject of that slug.
  const build = { author: buildAuthorLinksGraph, work: buildWorkLinksGraph, subject: buildSubjectBooksGraph, genre: buildSubjectBooksGraph }[type];
  const graph: (Graph & { workCount?: number }) | null = (await build?.(id)) ?? null;
  if (!graph) return null;
  // The centre can come back under another id (a genre's "subject:", a
  // redirected work), so it's renamed to the id asked for, or the search
  // would never see its edges touch this node.
  const rename = (end: string) => (end === graph.centerId ? nodeId : end);
  return {
    nodes: graph.nodes.map((n) => (n.id === graph.centerId ? { ...n, id: nodeId } : n)),
    edges: graph.edges.map((e) => ({ ...e, source: rename(e.source), target: rename(e.target) })),
    workCount: graph.workCount,
  };
};

type Entry = { cost: number; hops: number; prev: string | null; edge: GraphEdge | null };
type Side = { seen: Map<string, Entry>; started: Set<string> };
type Found = { ids: string[]; edges: GraphEdge[]; cost: number };

/**
 * Up to MAX_PATHS undirected paths between two node ids, most specific first,
 * by a best-first bidirectional search over a lazily expanded neighbourhood.
 *
 * Priority: a node the other side has already reached goes first (one fetch,
 * often cached, turns it into a path). Otherwise the cheapest node by path
 * cost from its own end, counting its own subject breadth, so people and
 * books and narrow subjects are opened before broad subjects' books.
 *
 * The search stops once MAX_PATHS paths are kept and nothing left can beat
 * the worst of them, or on a cap, the time budget or `signal` aborting; it
 * returns whatever paths it has by then. Edges keep their original direction
 * so the caller can read each one as "source relation target". `from` and
 * `to` must differ (the route rejects equal ids).
 */
export function findPath(
  from: string,
  to: string,
  neighbours: Neighbours,
  limits: PathLimits = DEFAULT_LIMITS,
  signal?: AbortSignal
): Promise<PathResult> {
  const nodes = new Map<string, GraphNode>();
  const fetched = new Map<string, Promise<Neighbourhood | null>>();
  const breadth = new Map<string, number>();
  const sides: Side[] = [from, to].map((root) => ({
    seen: new Map([[root, { cost: 0, hops: 0, prev: null, edge: null }]]),
    started: new Set<string>(),
  }));
  const found: Found[] = [];
  let expansions = 0;
  const started = Date.now();
  let running = 0;
  let capHit = false;
  let depthPruned = false;
  let upstreamDown = false;

  const penalty = (id: string) => {
    if (!/^(subject|genre):/.test(id)) return 0;
    const count = breadth.get(id);
    return count === undefined ? UNPROBED_SUBJECT_PENALTY : Math.log10(1 + count);
  };

  // Both sides can open the same node; it's fetched once. An upstream failure
  // for one node makes it a dead end, not a failed search.
  const expand = (nodeId: string) => {
    let hood = fetched.get(nodeId);
    if (!hood) {
      expansions++;
      hood = neighbours(nodeId).catch((err) => {
        // Open Library is in a cooldown: every further expansion would fail fast too.
        if (err instanceof UpstreamUnavailableError && err.host === "openlibrary.org") upstreamDown = true;
        console.warn(`[graphQuery] Failed to expand ${nodeId}:`, err);
        return null;
      });
      fetched.set(nodeId, hood);
    }
    return hood;
  };

  const pick = () => {
    let best: { s: number; id: string; key: number } | null = null;
    sides.forEach((side, s) => {
      const other = sides[1 - s];
      for (const [id, entry] of side.seen) {
        if (side.started.has(id)) continue;
        const across = other.seen.get(id);
        // A meeting must fit in maxDepth; anything else must still be able to reach a node the other side holds.
        const fits = across ? entry.hops + across.hops <= limits.maxDepth : entry.hops <= limits.maxDepth - 2;
        if (!fits) {
          depthPruned = true;
          continue;
        }
        const key = across ? -1 : entry.cost + penalty(id);
        if (!best || key < best.key) best = { s, id, key };
      }
    });
    return best as { s: number; id: string; key: number } | null;
  };

  const chain = (side: Side, id: string) => {
    const ids = [id];
    const edges: GraphEdge[] = [];
    for (let e = side.seen.get(id)!; e.prev; e = side.seen.get(e.prev)!) {
      ids.push(e.prev);
      edges.push(e.edge!);
    }
    return { ids, edges };
  };

  const record = (meet: string) => {
    const f = chain(sides[0], meet);
    const b = chain(sides[1], meet);
    const ids = [...f.ids.reverse(), ...b.ids.slice(1)];
    // The two halves can share a node (A -> X <- A); that's not a real path.
    if (new Set(ids).size !== ids.length) return;
    const key = ids.slice(1, -1).sort().join("|");
    if (found.some((p) => p.ids.slice(1, -1).sort().join("|") === key)) return;
    const cost = (ids.length - 1) * HOP_COST + ids.slice(1, -1).reduce((sum, id) => sum + penalty(id), 0);
    found.push({ ids, edges: [...f.edges.reverse(), ...b.edges], cost });
    found.sort((x, y) => x.cost - y.cost);
    found.length = Math.min(found.length, MAX_PATHS);
  };

  return new Promise<PathResult>((resolve) => {
    let finished = false;
    const finish = (reason: Extract<PathResult, { found: false }>["reason"]) => {
      if (finished) return;
      finished = true;
      const outcome = found.length ? `${found.length} path(s)` : reason;
      console.info(`[graphQuery] ${from} -> ${to}: ${outcome} after ${expansions} expansions in ${Date.now() - started} ms`);
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      resolve(found.length ? { found: true, paths: found.map((p) => toPath(p, nodes)) } : { found: false, reason });
    };
    const stop = () => finish("timeout");
    const timer = setTimeout(stop, limits.timeBudgetMs);
    signal?.addEventListener("abort", stop);

    const pump = () => {
      while (!finished && running < limits.concurrency) {
        if (upstreamDown) return finish("upstreamUnavailable");
        if (sides[0].seen.size + sides[1].seen.size > limits.maxVisited || expansions >= limits.maxExpansions) {
          capHit = true;
          break;
        }
        const next = pick();
        if (!next) break;
        if (found.length >= MAX_PATHS && next.key >= found[found.length - 1].cost) break;
        const { s, id } = next;
        sides[s].started.add(id);
        running++;
        expand(id).then((hood) => {
          running--;
          if (finished) return;
          settle(s, id, hood);
          pump();
        });
      }
      if (upstreamDown) finish("upstreamUnavailable");
      else if (!finished && running === 0) finish(capHit ? "nodeCap" : depthPruned ? "depthCap" : "noPath");
    };

    const settle = (s: number, id: string, hood: Neighbourhood | null) => {
      const side = sides[s];
      const entry = side.seen.get(id)!;
      if (hood) {
        if (hood.workCount !== undefined) breadth.set(id, hood.workCount);
        for (const n of hood.nodes) if (!nodes.has(n.id)) nodes.set(n.id, n);
        // An end's own breadth is shared by every path, so it doesn't count.
        const cost = entry.cost + (entry.prev ? penalty(id) : 0) + HOP_COST;
        for (const edge of hood.edges) {
          if (edge.source !== id && edge.target !== id) continue;
          const next = edge.source === id ? edge.target : edge.source;
          if (isGenericSubject(next) && next !== from && next !== to) continue;
          // Started nodes never change, so a recorded chain stays valid.
          if (side.started.has(next) || (side.seen.get(next)?.cost ?? Infinity) <= cost) continue;
          side.seen.set(next, { cost, hops: entry.hops + 1, prev: id, edge });
        }
      }
      const across = sides[1 - s].seen.get(id);
      if (across && entry.hops + across.hops <= limits.maxDepth) record(id);
    };

    if (signal?.aborted) stop();
    else pump();
  });
}

function toPath(p: Found, nodes: Map<string, GraphNode>): GraphPath {
  // cleanGraph guarantees every edge endpoint has a node in the same graph.
  const pathNodes = p.ids.map((id) => nodes.get(id)!);
  return { nodes: pathNodes, edges: p.edges, summary: summarise(pathNodes) };
}

// shortcut: a fixed list of broad terms, a work-count cut-off is the upgrade if more show up.
export const GENERIC_SUBJECT_SLUGS: ReadonlySet<string> = new Set([
  "fiction", "juvenile_fiction", "fiction_general", "young_adult_fiction", "juvenile_literature", "literature", "novels", "general",
]);

/** A `subject:` or `genre:` id too broad to say anything as a link between two nodes. */
export function isGenericSubject(nodeId: string): boolean {
  const m = /^(?:subject|genre):(.*)$/.exec(nodeId);
  return !!m && GENERIC_SUBJECT_SLUGS.has(m[1]);
}

/** What links the two ends, in a line: the one node between them, or the chain. */
export function summarise(pathNodes: GraphNode[]): string {
  const mid = pathNodes.slice(1, -1);
  const [first, last] = [pathNodes[0], pathNodes[pathNodes.length - 1]];
  if (mid.length === 0) return `${first.label} and ${last.label} are directly linked`;
  if (mid.length === 1 && (mid[0].type === "subject" || mid[0].type === "genre")) return `Both: ${mid[0].label}`;
  if (mid.length === 1 && mid[0].type === "author" && first.type === "work" && last.type === "work") return `Same author: ${mid[0].label}`;
  return `Via ${mid.map((n) => n.label).join(" → ")}`;
}
