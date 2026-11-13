import { UpstreamUnavailableError } from "../httpClient.js";
import type { Graph, GraphNode, GraphEdge, Subject } from "@book-explorer/shared";
import { awardDisplayName, awardSlug, normalizeTitle, slugifySubject } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import * as openLibrary from "../sources/openLibrary.js";
import type { OpenLibraryAuthorWork } from "../sources/openLibrary.js";
import { getAuthorDetail, getAuthorLinks, type AuthorLinks } from "./authorService.js";
import { getAwardDetail } from "./awardService.js";
import { getSubjectBooks, getSubjectDetail } from "./subjectService.js";
import { getWorkDetail, getWorkLinks, type WorkLinks } from "./workService.js";

// Caps keep the client's force layout legible; a subject can have thousands of books.
const MAX_SUBJECT_BOOKS = 12;
const MAX_WORK_SUBJECTS = 8;
const MAX_WORK_GENRES = 6;
const MAX_AUTHOR_WORKS = 15;
const MAX_PSEUDONYM_WORKS = 8;

// buildAuthorGraph isn't cached, so these caches spare repeat views from re-hitting Open Library.
const authorWorksCache = new TtlCache<OpenLibraryAuthorWork[]>(1000 * 60 * 60, 1000, "authorWorks");
const pseudonymAuthorCache = new TtlCache<{ openLibraryId: string; name: string } | null>(1000 * 60 * 60 * 24, 1000, "pseudonymAuthor");

// Two Wikidata items can share an English label (e.g. "historical fiction" and its broader concept), so
// they slugify to the center's id. This drops the resulting self-loops and any edge with a missing endpoint.
export function cleanGraph(nodes: GraphNode[], edges: GraphEdge[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const byId = new Map<string, GraphNode>();
  for (const node of nodes) {
    if (!byId.has(node.id)) byId.set(node.id, node);
  }

  // Collapse same-title "work" duplicates onto whichever node was seen
  // first, and remember where each dropped id now points so edges that
  // referenced it can be redirected instead of silently vanishing.
  const idRedirects = new Map<string, string>();
  const survivorIdByTitleKey = new Map<string, string>();
  for (const node of byId.values()) {
    if (node.type !== "work") continue;
    const key = normalizeTitle(node.label);
    if (!key) continue;
    const survivorId = survivorIdByTitleKey.get(key);
    if (survivorId === undefined) {
      survivorIdByTitleKey.set(key, node.id);
    } else if (survivorId !== node.id) {
      idRedirects.set(node.id, survivorId);
      byId.delete(node.id);
    }
  }
  const resolveId = (id: string) => idRedirects.get(id) ?? id;

  const seenEdgeKeys = new Set<string>();
  const dedupedEdges = edges.reduce<GraphEdge[]>((acc, edge) => {
    const source = resolveId(edge.source);
    const target = resolveId(edge.target);
    if (source === target) return acc;
    if (!byId.has(source) || !byId.has(target)) return acc;
    const key = `${source}|${target}|${edge.relation}`;
    if (seenEdgeKeys.has(key)) return acc;
    seenEdgeKeys.add(key);
    acc.push(source === edge.source && target === edge.target ? edge : { ...edge, source, target });
    return acc;
  }, []);

  return { nodes: [...byId.values()], edges: dedupedEdges };
}

function awardNode(label: string): GraphNode {
  return { id: `award:${awardSlug(label)}`, type: "award", label: awardDisplayName(label), navigable: true };
}

function authorNodeId(openLibraryId: string | null, wikidataId: string): string {
  return openLibraryId ? `author:${openLibraryId}` : `author:qid:${wikidataId}`;
}

// Wikidata P737 ("influenced by") sometimes points at a work (e.g. Tolkien -> Beowulf), not a person.
// An Open Library id's suffix ("A" author, "W" work) tells them apart without another query.
function influenceNodeTypeAndId(r: { openLibraryId: string | null; wikidataId: string }): { type: GraphNode["type"]; id: string } {
  if (r.openLibraryId?.endsWith("W")) return { type: "work", id: `work:${r.openLibraryId}` };
  return { type: "author", id: authorNodeId(r.openLibraryId, r.wikidataId) };
}

export async function buildAuthorGraph(openLibraryId: string): Promise<Graph | null> {
  const author = await getAuthorDetail(openLibraryId);
  return author && authorGraph(author);
}

/** Path search's author graph: the same links from a lighter lookup (see getAuthorLinks). */
export async function buildAuthorLinksGraph(openLibraryId: string): Promise<Graph | null> {
  const author = await getAuthorLinks(openLibraryId);
  return author && authorGraph(author);
}

async function authorGraph(author: AuthorLinks): Promise<Graph> {
  const centerId = `author:${author.openLibraryId}`;
  const nodes: GraphNode[] = [{ id: centerId, type: "author", label: author.name, navigable: true }];
  const edges: GraphEdge[] = [];

  for (const r of author.relations) {
    if (r.relation === "influencedBy" || r.relation === "influenced") {
      const { type: nodeType, id: nodeId } = influenceNodeTypeAndId(r);
      nodes.push({ id: nodeId, type: nodeType, label: r.label, navigable: !!r.openLibraryId });
      // One direction-encoded "influencedBy" relation: the source was influenced by the target.
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
    } else if (r.relation === "award") {
      const node = awardNode(r.label);
      nodes.push(node);
      edges.push({ source: centerId, target: node.id, relation: "won" });
    }
  }

  // Open Library's full bibliography; Wikidata P800 notable works are usually a curated handful.
  const ownWorks = await authorWorksCache.wrap(author.openLibraryId, () =>
    openLibrary.getAuthorWorks(author.openLibraryId, MAX_AUTHOR_WORKS)
  );
  for (const w of ownWorks) {
    const nodeId = `work:${w.workId}`;
    nodes.push({ id: nodeId, type: "work", label: w.title, navigable: true });
    edges.push({ source: centerId, target: nodeId, relation: "wrote" });
  }

  // Some books sit under a pen name's separate Open Library author record; Wikidata P742 pseudonyms are
  // matched best-effort, and a failed match is non-fatal. Lookups are independent, so they run concurrently.
  const pseudonymWorkLists = await Promise.all(
    author.pseudonyms.map(async (pseudonym) => {
      try {
        const match = await pseudonymAuthorCache.wrap(pseudonym, () => openLibrary.searchAuthorByName(pseudonym));
        if (!match) return [];
        return await authorWorksCache.wrap(match.openLibraryId, () =>
          openLibrary.getAuthorWorks(match.openLibraryId, MAX_PSEUDONYM_WORKS)
        );
      } catch (err) {
        if (err instanceof UpstreamUnavailableError) throw err;
        console.warn(`[graphService] Failed to look up pseudonym "${pseudonym}" for ${author.openLibraryId}:`, err);
        return [];
      }
    })
  );
  for (const pseudonymWorks of pseudonymWorkLists) {
    for (const w of pseudonymWorks) {
      const nodeId = `work:${w.workId}`;
      nodes.push({ id: nodeId, type: "work", label: w.title, navigable: true });
      edges.push({ source: centerId, target: nodeId, relation: "wroteAs" });
    }
  }

  return { centerId, ...cleanGraph(nodes, edges) };
}

export async function buildSubjectGraph(slug: string): Promise<Graph | null> {
  const subject = await getSubjectDetail(slug);
  return subject && subjectGraph(subject);
}

/** Path search only: a subject's books and its work count, without the slow related-concept lookups. */
export async function buildSubjectBooksGraph(slug: string): Promise<(Graph & { workCount: number }) | null> {
  const subject = await getSubjectBooks(slug);
  return subject && { ...subjectGraph(subject), workCount: subject.workCount };
}

function subjectGraph(subject: Subject): Graph {
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
  return work && workGraph(work);
}

/** Path search's work graph: the same links from a lighter lookup (see getWorkLinks). */
export async function buildWorkLinksGraph(workId: string): Promise<Graph | null> {
  const work = await getWorkLinks(workId);
  return work && workGraph(work);
}

function workGraph(work: WorkLinks): Graph {
  const centerId = `work:${work.openLibraryWorkId}`;
  const nodes: GraphNode[] = [{ id: centerId, type: "work", label: work.title, navigable: true }];
  const edges: GraphEdge[] = [];

  for (const author of work.authors) {
    const nodeId = `author:${author.openLibraryId}`;
    nodes.push({ id: nodeId, type: "author", label: author.name, navigable: true });
    edges.push({ source: nodeId, target: centerId, relation: "author" });
  }

  for (const award of work.awards) {
    const node = awardNode(award);
    nodes.push(node);
    edges.push({ source: centerId, target: node.id, relation: "won" });
  }

  // Open Library sometimes files a genre as a subject with a "genre:" prefix; pull it out, strip the prefix
  // and merge it into genres so it doesn't duplicate the real genre node.
  const GENRE_SUBJECT_PREFIX = /^genre:\s*/i;
  const plainSubjects: { label: string; slug?: string }[] = [];
  const genresFromSubjects: string[] = [];
  for (const { label, slug } of work.subjects) {
    if (GENRE_SUBJECT_PREFIX.test(label)) {
      genresFromSubjects.push(label.replace(GENRE_SUBJECT_PREFIX, "").trim());
    } else {
      plainSubjects.push({ label, slug });
    }
  }

  for (const subject of plainSubjects.slice(0, MAX_WORK_SUBJECTS)) {
    const nodeId = `subject:${subject.slug ?? slugifySubject(subject.label)}`;
    nodes.push({ id: nodeId, type: "subject", label: subject.label, navigable: true });
    edges.push({ source: centerId, target: nodeId, relation: "subject" });
  }

  // Genres get their own "genre:" id namespace: a genre and a subject can share a slug (e.g. "Fiction")
  // and must not collapse into one node.
  for (const genre of [...work.genres.map((g) => g.label), ...genresFromSubjects].slice(0, MAX_WORK_GENRES)) {
    const nodeId = `genre:${slugifySubject(genre)}`;
    nodes.push({ id: nodeId, type: "genre", label: genre, navigable: true });
    edges.push({ source: centerId, target: nodeId, relation: "genre" });
  }

  // One summary node, not one per edition (a popular work has dozens); it points at the Editions section,
  // which already lists the editions.
  if (work.editions.length > 0) {
    const editionsNodeId = `editions:${work.openLibraryWorkId}`;
    nodes.push({ id: editionsNodeId, type: "editions", label: "Editions", navigable: true });
    edges.push({ source: centerId, target: editionsNodeId, relation: "editions" });
  }

  return { centerId, ...cleanGraph(nodes, edges) };
}

export async function buildAwardGraph(slug: string, label?: string): Promise<Graph> {
  const award = await getAwardDetail(slug, label);
  const centerId = `award:${award.slug}`;
  const nodes: GraphNode[] = [{ id: centerId, type: "award", label: award.name, navigable: true }];
  const edges: GraphEdge[] = [];
  for (const w of award.winners) {
    if (!w.openLibraryId || !w.kind) continue; // unresolved winners stay on the page only
    const id = `${w.kind}:${w.openLibraryId}`;
    nodes.push({ id, type: w.kind, label: w.label, navigable: true });
    edges.push({ source: id, target: centerId, relation: "won" });
  }
  return { centerId, ...cleanGraph(nodes, edges) };
}
