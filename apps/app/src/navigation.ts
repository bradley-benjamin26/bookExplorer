import type { GraphNode } from "@book-explorer/shared";
import type { Href } from "expo-router";
import type { ListMember } from "./storage/savedLists";

// Centralizes route construction using Expo Router's object href form, which
// encodes params itself — building hrefs as plain template literals (as
// every screen originally did) silently broke for any id/slug containing a
// character that needs URL-encoding. Open Library subject slugs commonly
// contain commas and parentheses (e.g. "british_and_irish_fiction_(fictional...)"),
// and manually-typed ISBNs can contain anything at all.
export const routes = {
  book: (isbn: string, options?: { edit?: boolean }): Href => ({
    pathname: "/book/[isbn]",
    params: options?.edit ? { isbn, edit: "1" } : { isbn },
  }),
  author: (id: string): Href => ({ pathname: "/author/[id]", params: { id } }),
  subject: (slug: string): Href => ({ pathname: "/subject/[slug]", params: { slug } }),
  work: (id: string, options?: { highlight?: string }): Href => ({
    pathname: "/work/[id]",
    params: options?.highlight ? { id, highlight: options.highlight } : { id },
  }),
  /** `pathTo` (a node id) shows only a path from this node to it, see /api/path; `pathIndex` picks which (default the best, "0"). */
  graph: (
    type: GraphNode["type"],
    id: string,
    filter: { hideTypes?: string; hideRelations?: string; pathTo?: string; pathIndex?: string } = {}
  ): Href => ({
    pathname: "/graph/[type]/[id]",
    params: { type, id, ...filter },
  }),
  /** `from` is a graph node id, e.g. "work:OL1W"; `label` names it on the screen. With neither, the screen has no starting point (Task 10 adds a picker). */
  connection: (from?: string, label?: string): Href => ({ pathname: "/connection", params: from ? { from, label } : {} }),
  saved: (): Href => "/saved",
  recommendations: (): Href => "/recommendations",
  backup: (): Href => "/backup",
  settings: (): Href => "/settings",
  about: (): Href => "/about",
  lists: (): Href => "/lists",
  list: (id: string): Href => ({ pathname: "/lists/[id]", params: { id } }),
  search: (query?: string): Href => ({ pathname: "/search", params: query ? { q: query } : {} }),
};

export const memberHref = (m: Pick<ListMember, "type" | "id">): Href =>
  m.type === "author" ? routes.author(m.id) : m.type === "work" ? routes.work(m.id) : routes.book(m.id);

/** The page a graph node id ("author:OL1A", "editions:OL2W", …) opens; null for unresolved (":qid:") nodes. */
export const nodeHref = (nodeId: string): Href | null => {
  const [type, ...rest] = nodeId.split(":");
  const id = rest.join(":");
  if (id.startsWith("qid:")) return null;
  if (type === "author") return routes.author(id);
  if (type === "subject" || type === "genre") return routes.subject(id);
  if (type === "work") return routes.work(id);
  if (type === "editions") return routes.work(id, { highlight: "editions" });
  return null;
};
