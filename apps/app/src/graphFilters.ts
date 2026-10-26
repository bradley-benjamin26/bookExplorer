import type { Graph } from "@book-explorer/shared";

/** What the user has switched off; empty lists mean the full graph. */
export interface GraphFilter {
  hiddenTypes: string[];
  hiddenRelations: string[];
}

export const isFiltered = (f: GraphFilter) => f.hiddenTypes.length + f.hiddenRelations.length > 0;

/**
 * Drops hidden relations and node types, then any edge left dangling and any non-centre node left
 * with no edges (mirrors the server's cleanGraph). The centre node is never removed.
 */
export function applyGraphFilter(graph: Graph, filter: GraphFilter): Graph {
  if (!isFiltered(filter)) return graph;
  const kept = new Map(
    graph.nodes
      .filter((n) => n.id === graph.centerId || !filter.hiddenTypes.includes(n.type))
      .map((n) => [n.id, n])
  );
  const edges = graph.edges.filter(
    (e) => !filter.hiddenRelations.includes(e.relation) && kept.has(e.source) && kept.has(e.target)
  );
  // Keep only what is still connected to the centre, so no islands float free.
  const reach = new Set([graph.centerId]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const e of edges) {
      if (reach.has(e.source) !== reach.has(e.target)) {
        reach.add(e.source).add(e.target);
        grew = true;
      }
    }
  }
  const nodes = [...kept.values()].filter((n) => reach.has(n.id));
  const keptEdges = edges.filter((e) => reach.has(e.source) && reach.has(e.target));
  return { ...graph, nodes, edges: keptEdges };
}

/** Route query params for a filter; omitted entirely when nothing is hidden. */
export function filterToParams(f: GraphFilter): Record<string, string> {
  return {
    ...(f.hiddenTypes.length ? { hideTypes: f.hiddenTypes.join(",") } : {}),
    ...(f.hiddenRelations.length ? { hideRelations: f.hiddenRelations.join(",") } : {}),
  };
}

export function filterFromParams(params: { hideTypes?: string | string[]; hideRelations?: string | string[] }): GraphFilter {
  // A hand-edited link can repeat a key, which the router hands back as an array.
  const list = (s?: string | string[]) => (s ? [s].flat().flatMap((v) => v.split(",")).filter(Boolean) : []);
  return { hiddenTypes: list(params.hideTypes), hiddenRelations: list(params.hideRelations) };
}

/** Returns `list` with `value` toggled in or out. */
export const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
