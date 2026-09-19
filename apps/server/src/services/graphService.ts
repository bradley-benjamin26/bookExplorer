import type { Graph, GraphNode, GraphEdge } from "@book-explorer/shared";
import { slugifySubject } from "@book-explorer/shared";
import { getAuthorDetail } from "./authorService.js";
import { getSubjectDetail } from "./subjectService.js";
import { getWorkDetail } from "./workService.js";

// Caps keep the force-directed layout on the client legible — a subject can
// have thousands of books, and rendering them all would just produce a
// solid blob of overlapping nodes rather than anything explorable.
const MAX_SUBJECT_BOOKS = 12;
const MAX_WORK_SUBJECTS = 8;

// Two different Wikidata items can carry the same English label — e.g. the
// subject "historical fiction" (Q136472) has a *broader* concept that is
// also labeled "historical fiction" (Q1196408, a different item entirely).
// Both slugify to the same node id as the center, so a naive build would
// produce a node the deduper silently drops (fine) but leave behind its
// edge now pointing from the center back to itself (not fine — a same-id
// self-loop that's confusing on screen and, depending on the force layout
// library, can behave oddly). Building nodes/edges is kept simple and this
// runs once at the end to clean up both cases, plus drops any edge whose
// endpoint didn't end up with a matching node at all, so a malformed graph
// degrades to "missing a connection" instead of crashing the client's
// force-layout renderer on a dangling reference.
function cleanGraph(nodes: GraphNode[], edges: GraphEdge[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const byId = new Map<string, GraphNode>();
  for (const node of nodes) {
    if (!byId.has(node.id)) byId.set(node.id, node);
  }

  const seenEdgeKeys = new Set<string>();
  const dedupedEdges = edges.filter((edge) => {
    if (edge.source === edge.target) return false;
    if (!byId.has(edge.source) || !byId.has(edge.target)) return false;
    const key = `${edge.source}|${edge.target}|${edge.relation}`;
    if (seenEdgeKeys.has(key)) return false;
    seenEdgeKeys.add(key);
    return true;
  });

  return { nodes: [...byId.values()], edges: dedupedEdges };
}

function authorNodeId(openLibraryId: string | null, wikidataId: string): string {
  return openLibraryId ? `author:${openLibraryId}` : `author:qid:${wikidataId}`;
}

export async function buildAuthorGraph(openLibraryId: string): Promise<Graph | null> {
  const author = await getAuthorDetail(openLibraryId);
  if (!author) return null;

  const centerId = `author:${author.openLibraryId}`;
  const nodes: GraphNode[] = [{ id: centerId, type: "author", label: author.name, navigable: true }];
  const edges: GraphEdge[] = [];

  for (const r of author.relations) {
    if (r.relation === "influencedBy" || r.relation === "influenced") {
      const nodeId = authorNodeId(r.openLibraryId, r.wikidataId);
      nodes.push({ id: nodeId, type: "author", label: r.label, navigable: !!r.openLibraryId });
      // A single "influencedBy" relation, direction-encoded: the source was
      // influenced by the target. Collapses "center influencedBy X" and
      // "X influenced by center" into the same edge shape either way.
      edges.push(
        r.relation === "influencedBy"
          ? { source: centerId, target: nodeId, relation: "influencedBy" }
          : { source: nodeId, target: centerId, relation: "influencedBy" }
      );
    } else if (r.relation === "notableWork") {
      const nodeId = r.openLibraryId ? `work:${r.openLibraryId}` : `work:qid:${r.wikidataId}`;
      nodes.push({ id: nodeId, type: "work", label: r.label, navigable: !!r.openLibraryId });
      edges.push({ source: centerId, target: nodeId, relation: "notableWork" });
    } else if (r.relation === "movement") {
      const nodeId = `subject:${slugifySubject(r.label)}`;
      nodes.push({ id: nodeId, type: "subject", label: r.label, navigable: true });
      edges.push({ source: centerId, target: nodeId, relation: "movement" });
    }
  }

  return { centerId, ...cleanGraph(nodes, edges) };
}

export async function buildSubjectGraph(slug: string): Promise<Graph | null> {
  const subject = await getSubjectDetail(slug);
  if (!subject) return null;

  const centerId = `subject:${subject.slug}`;
  const nodes: GraphNode[] = [{ id: centerId, type: "subject", label: subject.name, navigable: true }];
  const edges: GraphEdge[] = [];

  for (const book of subject.books.slice(0, MAX_SUBJECT_BOOKS)) {
    const nodeId = `work:${book.openLibraryWorkId}`;
    nodes.push({ id: nodeId, type: "work", label: book.title, navigable: true });
    edges.push({ source: centerId, target: nodeId, relation: "hasBook" });
  }

  for (const concept of subject.relatedConcepts) {
    const nodeId = `subject:${slugifySubject(concept.label)}`;
    nodes.push({ id: nodeId, type: "subject", label: concept.label, navigable: true });
    // A single "broader" relation, direction-encoded, mirroring influencedBy above.
    edges.push(
      concept.relation === "broader"
        ? { source: centerId, target: nodeId, relation: "broader" }
        : { source: nodeId, target: centerId, relation: "broader" }
    );
  }

  return { centerId, ...cleanGraph(nodes, edges) };
}

export async function buildWorkGraph(workId: string): Promise<Graph | null> {
  const work = await getWorkDetail(workId);
  if (!work) return null;

  const centerId = `work:${work.openLibraryWorkId}`;
  const nodes: GraphNode[] = [{ id: centerId, type: "work", label: work.title, navigable: true }];
  const edges: GraphEdge[] = [];

  for (const author of work.authors) {
    const nodeId = `author:${author.openLibraryId}`;
    nodes.push({ id: nodeId, type: "author", label: author.name, navigable: true });
    edges.push({ source: nodeId, target: centerId, relation: "author" });
  }

  for (const subject of work.subjects.slice(0, MAX_WORK_SUBJECTS)) {
    const nodeId = `subject:${slugifySubject(subject)}`;
    nodes.push({ id: nodeId, type: "subject", label: subject, navigable: true });
    edges.push({ source: centerId, target: nodeId, relation: "subject" });
  }

  return { centerId, ...cleanGraph(nodes, edges) };
}
