import type { Href } from "expo-router";

const SCHEME = "bookexplorer://";

/** Builds the `bookexplorer://` deep link for a `routes.*` href (object form, or a plain path like "/saved"). */
export function schemeUrl(href: Href): string {
  if (typeof href === "string") return SCHEME + href.replace(/^\//, "");
  const { pathname, params = {} } = href as { pathname: string; params?: Record<string, string> };
  const rest = { ...params };
  const path = pathname.replace(/\[(\w+)\]/g, (_, key) => {
    const value = rest[key];
    delete rest[key];
    return encodeURIComponent(value);
  });
  const query = new URLSearchParams(rest).toString();
  return SCHEME + path.replace(/^\//, "") + (query ? `?${query}` : "");
}

/** Inverse of schemeUrl: the path segments (decoded) and query params of a deep link. */
export function parseSchemeUrl(url: string): { segments: string[]; params: Record<string, string> } {
  const [path, query = ""] = url.slice(SCHEME.length).split("?");
  return {
    segments: path.split("/").filter(Boolean).map(decodeURIComponent),
    params: Object.fromEntries(new URLSearchParams(query)),
  };
}

const OPEN_LIBRARY = "https://openlibrary.org";

/** Public Open Library pages for the shareable entity types. */
export const openLibraryUrl = {
  book: (isbn: string) => `${OPEN_LIBRARY}/isbn/${encodeURIComponent(isbn)}`,
  work: (id: string) => `${OPEN_LIBRARY}/works/${encodeURIComponent(id)}`,
  author: (id: string) => `${OPEN_LIBRARY}/authors/${encodeURIComponent(id)}`,
  subject: (slug: string) => `${OPEN_LIBRARY}/subjects/${encodeURIComponent(slug)}`,
};

/** Text shared for an entity: its title, the in-app deep link, then the Open Library page (which works for people without the app). */
export function shareMessage(title: string, href: Href, publicUrl: string): string {
  return `${title}\n${schemeUrl(href)}\n${publicUrl}`;
}
