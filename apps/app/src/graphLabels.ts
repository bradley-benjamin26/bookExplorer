import type { Graph, GraphNode, GraphPath, PathResult } from "@book-explorer/shared";

export const NODE_LABELS: Record<GraphNode["type"], string> = {
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
export const RELATION_LABELS: Record<string, string> = {
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

export interface PathStep {
  node: GraphNode;
  /** How this node joins the previous one, read along the edge's own direction; null for the first. */
  relation: string | null;
  accessibilityLabel: string;
}

/** A found path as a top-to-bottom chain, each step labelled for screen readers with its relation. */
export function pathSteps(path: GraphPath): PathStep[] {
  const byId = new Map(path.nodes.map((n) => [n.id, n]));
  return path.nodes.map((node, i) => {
    const edge = i > 0 ? path.edges[i - 1] : undefined;
    const relation = edge
      ? `${byId.get(edge.source)?.label} ${RELATION_LABELS[edge.relation] ?? edge.relation} ${byId.get(edge.target)?.label}`
      : null;
    const label = `Step ${i + 1} of ${path.nodes.length}: ${node.label}, ${NODE_LABELS[node.type]}`;
    return { node, relation, accessibilityLabel: relation ? `${label}. ${relation}` : label };
  });
}

/** "source relation target" sentences for each distinct edge touching a node, in edge order. */
export function nodeRelations(graph: Graph, nodeId: string): string[] {
  const labels = new Map(graph.nodes.map((n) => [n.id, n.label]));
  const sentences = graph.edges
    .filter((e) => (e.source === nodeId || e.target === nodeId) && labels.has(e.source) && labels.has(e.target))
    .map((e) => `${labels.get(e.source)} ${RELATION_LABELS[e.relation] ?? e.relation} ${labels.get(e.target)}`);
  return [...new Set(sentences)];
}

export const PATH_NOT_FOUND_MESSAGES: Record<Extract<PathResult, { found: false }>["reason"], string> = {
  noPath: "No connection found between these two.",
  depthCap: "No connection within a few steps.",
  nodeCap: "The search grew too large before it found a connection.",
  timeout: "The search ran out of time before it found a connection.",
  upstreamUnavailable: "Book data is temporarily unavailable, so the search stopped. Try again in a few minutes.",
};

/** One path of a result (the best when `index` is out of range) as a graph centred on its start; throws the reason when none was found. */
export function pathAsGraph(result: PathResult, index = 0): Graph {
  if (!result.found) throw new Error(PATH_NOT_FOUND_MESSAGES[result.reason]);
  const { nodes, edges } = result.paths[index] ?? result.paths[0];
  return { centerId: nodes[0].id, nodes, edges };
}

/** Which node types the legend should list (those on screen) and whether to explain faded, unlinked nodes. */
export function legendEntries(nodes: GraphNode[]): { types: GraphNode["type"][]; showUnlinked: boolean } {
  const present = new Set(nodes.map((n) => n.type));
  return {
    types: (Object.keys(NODE_LABELS) as GraphNode["type"][]).filter((t) => present.has(t)),
    showUnlinked: nodes.some((n) => !n.navigable),
  };
}
