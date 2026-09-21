import type { GraphNode } from "@book-explorer/shared";
import type { Href } from "expo-router";

// Centralizes route construction using Expo Router's object href form, which
// encodes params itself — building hrefs as plain template literals (as
// every screen originally did) silently broke for any id/slug containing a
// character that needs URL-encoding. Open Library subject slugs commonly
// contain commas and parentheses (e.g. "british_and_irish_fiction_(fictional...)"),
// and manually-typed ISBNs can contain anything at all.
export const routes = {
  book: (isbn: string): Href => ({ pathname: "/book/[isbn]", params: { isbn } }),
  author: (id: string): Href => ({ pathname: "/author/[id]", params: { id } }),
  subject: (slug: string): Href => ({ pathname: "/subject/[slug]", params: { slug } }),
  work: (id: string, options?: { highlight?: string }): Href => ({
    pathname: "/work/[id]",
    params: options?.highlight ? { id, highlight: options.highlight } : { id },
  }),
  graph: (type: GraphNode["type"], id: string): Href => ({ pathname: "/graph/[type]/[id]", params: { type, id } }),
  saved: (): Href => "/saved",
  search: (query?: string): Href => ({ pathname: "/search", params: query ? { q: query } : {} }),
};
