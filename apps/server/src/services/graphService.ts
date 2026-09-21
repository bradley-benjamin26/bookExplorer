import type { Graph, GraphNode, GraphEdge } from "@book-explorer/shared";
import { slugifySubject } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import * as openLibrary from "../sources/openLibrary.js";
import type { OpenLibraryAuthorWork } from "../sources/openLibrary.js";
import { getAuthorDetail } from "./authorService.js";
import { getSubjectDetail } from "./subjectService.js";
import { getWorkDetail } from "./workService.js";

// Caps keep the force-directed layout on the client legible — a subject can
// have thousands of books, and rendering them all would just produce a
// solid blob of overlapping nodes rather than anything explorable.
const MAX_SUBJECT_BOOKS = 12;
const MAX_WORK_SUBJECTS = 8;
const MAX_WORK_GENRES = 6;
const MAX_AUTHOR_WORKS = 15;
const MAX_PSEUDONYM_WORKS = 8;

// buildAuthorGraph itself isn't cached (each request recomputes it from the
// already-cached pieces below), so these give repeat views of the same
// author graph the same speed the Wikidata-derived side already gets from
// authorService's cache, instead of re-hitting Open Library every time.
const authorWorksCache = new TtlCache<OpenLibraryAuthorWork[]>(1000 * 60 * 60);
const pseudonymAuthorCache = new TtlCache<{ openLibraryId: string; name: string } | null>(1000 * 60 * 60 * 24);

// Open Library frequently catalogs what's really the same book as several
// separate "work" records: a leading- or trailing-article variant ("The
// Cricket in Times Square" / "Cricket in Times Square" / "Old Meadow, The"),
// a differently-capitalized duplicate, or one edition's record carrying a
// series subtitle another edition's doesn't ("The Cricket in Times Square
// (Chester Cricket and His Friends)"). Stripping articles, trailing
// parentheticals, and punctuation collapses all of these onto the same key.
// This deliberately does NOT attempt to merge translations (e.g. "Grillo en
// Times Square", a Spanish edition of the same book) — their titles share
// no text to normalize toward, so any title-based heuristic that caught
// those would also risk merging genuinely different books that happen to
// share common words.
export function normalizeTitle(title: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  const noSubtitle = base.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const noTrailingArticle = noSubtitle.replace(/,\s*(the|a|an)$/, "").trim();
  const noLeadingArticle = noTrailingArticle.replace(/^(the|a|an)\s+/, "");
  return noLeadingArticle.replace(/[^a-z0-9]+/g, " ").trim();
}

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

function authorNodeId(openLibraryId: string | null, wikidataId: string): string {
  return openLibraryId ? `author:${openLibraryId}` : `author:qid:${wikidataId}`;
}

// Wikidata's P737 ("influenced by"/its inverse) is nominally for influence
// between people, but it isn't strictly enforced — it's also used for a
// work that shaped an author's writing. Confirmed live: J.R.R. Tolkien's
// Wikidata entry lists "Beowulf" (the poem itself, Open Library id
// OL16287028W) as an influence, which a blanket "every P737 target is an
// author" assumption rendered as a work wrongly colored and labeled as a
// person. An Open Library id's own suffix ("A" for an author record, "W"
// for a work) is a reliable, already-available signal for which it
// actually is — no extra Wikidata query needed to tell them apart.
function influenceNodeTypeAndId(r: { openLibraryId: string | null; wikidataId: string }): { type: GraphNode["type"]; id: string } {
  if (r.openLibraryId?.endsWith("W")) return { type: "work", id: `work:${r.openLibraryId}` };
  return { type: "author", id: authorNodeId(r.openLibraryId, r.wikidataId) };
}

export async function buildAuthorGraph(openLibraryId: string): Promise<Graph | null> {
  const author = await getAuthorDetail(openLibraryId);
  if (!author) return null;

  const centerId = `author:${author.openLibraryId}`;
  const nodes: GraphNode[] = [{ id: centerId, type: "author", label: author.name, navigable: true }];
  const edges: GraphEdge[] = [];

  for (const r of author.relations) {
    if (r.relation === "influencedBy" || r.relation === "influenced") {
      const { type: nodeType, id: nodeId } = influenceNodeTypeAndId(r);
      nodes.push({ id: nodeId, type: nodeType, label: r.label, navigable: !!r.openLibraryId });
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

  // Open Library's own full bibliography for this author — Wikidata's P800
  // "notable work" statements above are usually a curated handful, far
  // short of what's actually catalogued (confirmed live: an author with 23
  // Open Library works had only 2 P800 statements on Wikidata), so this
  // fills the graph out with the rest.
  const ownWorks = await authorWorksCache.wrap(author.openLibraryId, () =>
    openLibrary.getAuthorWorks(author.openLibraryId, MAX_AUTHOR_WORKS)
  );
  for (const w of ownWorks) {
    const nodeId = `work:${w.workId}`;
    nodes.push({ id: nodeId, type: "work", label: w.title, navigable: true });
    edges.push({ source: centerId, target: nodeId, relation: "wrote" });
  }

  // Some of an author's books are catalogued in Open Library under a pen
  // name's own separate author record rather than this one (confirmed
  // live: George Selden's "Terry Andrews" pseudonym has 5 works under a
  // distinct Open Library author id that his own record doesn't list) —
  // Wikidata's P742 pseudonym names are matched to an Open Library author
  // record on a best-effort basis, same as this app's existing Wikidata
  // name-search heuristics. A failure to match or fetch one pseudonym's
  // works is non-fatal to the rest of an otherwise-successful graph.
  //
  // Each pseudonym's lookup is fully independent of every other's, so
  // they're run concurrently rather than one at a time in a loop — an
  // author with N pseudonyms (this app has seen up to 5) otherwise paid 2N
  // sequential network round trips (search + works-fetch per name) for no
  // reason.
  const pseudonymWorkLists = await Promise.all(
    author.pseudonyms.map(async (pseudonym) => {
      try {
        const match = await pseudonymAuthorCache.wrap(pseudonym, () => openLibrary.searchAuthorByName(pseudonym));
        if (!match) return [];
        return await authorWorksCache.wrap(match.openLibraryId, () =>
          openLibrary.getAuthorWorks(match.openLibraryId, MAX_PSEUDONYM_WORKS)
        );
      } catch (err) {
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

  // Open Library sometimes catalogs a genre as a plain subject with a
  // "genre:" facet prefix (e.g. "genre:Science Fiction") rather than in its
  // own genres list. Left as-is, that would show up as a "Subject" node
  // reading literally "genre:science fiction" right next to the real
  // "Science Fiction" genre node this same work already has — so it's
  // pulled out of the subjects list, has the prefix stripped, and is merged
  // into the genres below instead (where it dedupes against a same-named
  // genre via the shared "genre:<slug>" node id, same as any other repeated
  // genre would).
  const GENRE_SUBJECT_PREFIX = /^genre:\s*/i;
  const plainSubjects: string[] = [];
  const genresFromSubjects: string[] = [];
  for (const subject of work.subjects) {
    if (GENRE_SUBJECT_PREFIX.test(subject)) {
      genresFromSubjects.push(subject.replace(GENRE_SUBJECT_PREFIX, "").trim());
    } else {
      plainSubjects.push(subject);
    }
  }

  for (const subject of plainSubjects.slice(0, MAX_WORK_SUBJECTS)) {
    const nodeId = `subject:${slugifySubject(subject)}`;
    nodes.push({ id: nodeId, type: "subject", label: subject, navigable: true });
    edges.push({ source: centerId, target: nodeId, relation: "subject" });
  }

  // Genre nodes get their own "genre:" id namespace (rather than reusing
  // "subject:", even though tapping either lands on the same Subject browse
  // screen — a genre and a subject can share the same slugified label, e.g.
  // "Fiction", and giving them distinct ids keeps that from colliding into
  // one node that's wrongly colored/labeled as whichever type happened to be
  // added first).
  for (const genre of [...work.genres, ...genresFromSubjects].slice(0, MAX_WORK_GENRES)) {
    const nodeId = `genre:${slugifySubject(genre)}`;
    nodes.push({ id: nodeId, type: "genre", label: genre, navigable: true });
    edges.push({ source: centerId, target: nodeId, relation: "genre" });
  }

  // A single summary node, not one per edition (that's a much bigger graph
  // than this app's other nodes — a popular work can have dozens) — its
  // purpose is teaching the work/edition distinction itself (many people
  // outside library work don't have a name for it) by pointing at the
  // dedicated Editions section on this work's own page, which already lists
  // and lets you pick a specific edition, rather than duplicating that
  // picker as a second graph layer here.
  if (work.editions.length > 0) {
    const editionsNodeId = `editions:${work.openLibraryWorkId}`;
    nodes.push({ id: editionsNodeId, type: "editions", label: "Editions", navigable: true });
    edges.push({ source: centerId, target: editionsNodeId, relation: "editions" });
  }

  return { centerId, ...cleanGraph(nodes, edges) };
}
