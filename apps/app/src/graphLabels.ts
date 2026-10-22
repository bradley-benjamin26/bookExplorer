import type { Graph, GraphNode, PathResult } from "@book-explorer/shared";

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
export function pathSteps(path: Extract<PathResult, { found: true }>): PathStep[] {
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

export const PATH_NOT_FOUND_MESSAGES: Record<Extract<PathResult, { found: false }>["reason"], string> = {
  noPath: "No connection found between these two.",
  depthCap: "No connection within a few steps.",
  nodeCap: "The search grew too large before it found a connection.",
  timeout: "The search ran out of time before it found a connection.",
};

/** A path result as a graph centred on its start, for the graph renderer; throws the reason when none was found. */
export function pathAsGraph(path: PathResult): Graph {
  if (!path.found) throw new Error(PATH_NOT_FOUND_MESSAGES[path.reason]);
  return { centerId: path.nodes[0].id, nodes: path.nodes, edges: path.edges };
}
