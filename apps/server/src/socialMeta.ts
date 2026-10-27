import { isValidIsbn } from "@book-explorer/shared";
import { getAuthorDetail } from "./services/authorService.js";
import { getBookDetail } from "./services/bookService.js";
import { getSubjectDetail } from "./services/subjectService.js";
import { getWorkDetail } from "./services/workService.js";
import { isOpenLibraryAuthorId, isOpenLibraryWorkId, isSubjectSlug } from "./validation.js";

/** Where shared links point; the same value the app uses for its own share links. */
export const DEFAULT_WEB_ORIGIN = "https://shelfthread.com";

export interface PageMeta {
  title: string;
  description: string;
  image: string | null;
}

const SITE = "Shelf Thread";
const MAX_DESCRIPTION = 200;

function describe(text: string | null | undefined, title: string): string {
  const plain = (text ?? "").replace(/\s+/g, " ").trim();
  if (!plain) return `Explore ${title} on ${SITE}: its authors, subjects and connections.`;
  if (plain.length <= MAX_DESCRIPTION) return plain;
  const cut = plain.slice(0, MAX_DESCRIPTION);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

type Lookup = (id: string) => Promise<PageMeta | null>;

const withAuthors = (d: { title: string; authors: { name: string }[] }) =>
  d.authors.length ? `${d.title} by ${d.authors.map((a) => a.name).join(", ")}` : d.title;

const LOOKUPS: Record<string, { valid: (id: string) => boolean; load: Lookup }> = {
  work: {
    valid: isOpenLibraryWorkId,
    load: async (id) => {
      const w = await getWorkDetail(id);
      return w && { title: withAuthors(w), description: describe(w.description, w.title), image: w.coverUrl };
    },
  },
  book: {
    valid: isValidIsbn,
    load: async (id) => {
      const b = await getBookDetail(id);
      return b && { title: withAuthors(b), description: describe(b.description, b.title), image: b.coverUrl };
    },
  },
  author: {
    valid: isOpenLibraryAuthorId,
    load: async (id) => {
      const a = await getAuthorDetail(id);
      return a && { title: a.name, description: describe(a.bio, a.name), image: null };
    },
  },
  subject: {
    valid: isSubjectSlug,
    load: async (slug) => {
      const s = await getSubjectDetail(slug);
      return s && { title: s.name, description: describe(s.description, s.name), image: s.books[0]?.coverUrl ?? null };
    },
  },
};

/** Card text for a web path, from public data only; null for anything unknown, malformed or not found. */
export async function pageMeta(path: string): Promise<PageMeta | null> {
  let parts: string[];
  try {
    parts = path.split("/").slice(1).map(decodeURIComponent);
  } catch {
    return null; // malformed percent-encoding
  }
  const explore = parts[0] === "graph";
  if (explore) parts = parts.slice(1);
  if (parts.length !== 2 || !path.startsWith("/")) return null;
  const [type, id] = parts;
  const lookup = Object.hasOwn(LOOKUPS, type) ? LOOKUPS[type] : undefined;
  if (!lookup || (explore && type === "book") || !lookup.valid(id)) return null;
  try {
    const meta = await lookup.load(id);
    return meta && (explore ? { ...meta, title: `Explore ${meta.title}` } : meta);
  } catch {
    return null;
  }
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderSocialTags(meta: PageMeta | null, url: string, origin = DEFAULT_WEB_ORIGIN): string {
  const title = meta ? `${meta.title} · ${SITE}` : SITE;
  const description = meta?.description ?? "Scan or search a book, then follow the threads between authors, subjects and works.";
  const image = meta?.image ?? `${origin}/og-image.png`;
  const e = escapeHtml;
  return [
    `<title>${e(title)}</title>`,
    `<meta name="description" content="${e(description)}" />`,
    `<meta property="og:site_name" content="${SITE}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${e(title)}" />`,
    `<meta property="og:description" content="${e(description)}" />`,
    `<meta property="og:url" content="${e(url)}" />`,
    `<meta property="og:image" content="${e(image)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${e(title)}" />`,
    `<meta name="twitter:description" content="${e(description)}" />`,
    `<meta name="twitter:image" content="${e(image)}" />`,
  ].join("\n    ");
}

const START = "<!-- social:start -->";
const END = "<!-- social:end -->";

/** Swaps the tags between the template's markers (or adds them before </head>); sliced, not String.replace, so `$&` in a title stays literal. */
export function injectSocialTags(html: string, tags: string): string {
  const start = html.indexOf(START);
  const end = html.indexOf(END, start + START.length);
  if (start !== -1 && end !== -1) return html.slice(0, start + START.length) + tags + html.slice(end);
  const head = html.indexOf("</head>");
  return head === -1 ? html : html.slice(0, head) + tags + html.slice(head);
}
