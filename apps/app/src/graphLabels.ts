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

export const relationLabel = (relation: string) => RELATION_LABELS[relation] ?? relation;

const edgeSentence = (labels: Map<string, string | undefined>, e: { source: string; target: string; relation: string }) =>
  `${labels.get(e.source)} ${relationLabel(e.relation)} ${labels.get(e.target)}`;

export interface PathStep {
  node: GraphNode;
  /** How this node joins the previous one, read along the edge's own direction; null for the first. */
  relation: string | null;
  accessibilityLabel: string;
}

/** A found path as a top-to-bottom chain, each step labelled for screen readers with its relation. */
export function pathSteps(path: GraphPath): PathStep[] {
  const labels = new Map(path.nodes.map((n) => [n.id, n.label]));
  return path.nodes.map((node, i) => {
    const edge = i > 0 ? path.edges[i - 1] : undefined;
    const relation = edge ? edgeSentence(labels, edge) : null;
    const label = `Step ${i + 1} of ${path.nodes.length}: ${node.label}, ${NODE_LABELS[node.type]}`;
    return { node, relation, accessibilityLabel: relation ? `${label}. ${relation}` : label };
  });
}

/** "source relation target" sentences for each distinct edge touching a node, in edge order. */
export function nodeRelations(graph: Graph, nodeId: string): string[] {
  const labels = new Map(graph.nodes.map((n) => [n.id, n.label]));
  const sentences = graph.edges
    .filter((e) => (e.source === nodeId || e.target === nodeId) && labels.has(e.source) && labels.has(e.target))
    .map((e) => edgeSentence(labels, e));
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
