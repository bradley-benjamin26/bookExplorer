import { isValidIsbn } from "@book-explorer/shared";
import { getAuthorDetail } from "./services/authorService.js";
import { getBookDetail } from "./services/bookService.js";
import { getSubjectDetail } from "./services/subjectService.js";
import { getWorkDetail } from "./services/workService.js";
import { authorJsonLd, bookJsonLd, type JsonLd, renderJsonLd, subjectJsonLd, workJsonLd } from "./structuredData.js";
import { isOpenLibraryAuthorId, isOpenLibraryWorkId, isSubjectSlugInput } from "./validation.js";

/** Where shared links point; the same value the app uses for its own share links. */
export const DEFAULT_WEB_ORIGIN = "https://shelfthread.com";

export interface PageMeta {
  title: string;
  description: string;
  image: string | null;
  jsonLd?: JsonLd;
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

type Lookup = (id: string, origin: string) => Promise<PageMeta | null>;

/** Structured data is extra: a detail it can't read (e.g. an older cached shape) must not cost the page its card. */
function safeLd(build: () => JsonLd): JsonLd | undefined {
  try {
    return build();
  } catch {
    return undefined;
  }
}

const withAuthors = (d: { title: string; authors: { name: string }[] }) =>
  d.authors.length ? `${d.title} by ${d.authors.map((a) => a.name).join(", ")}` : d.title;

const LOOKUPS: Record<string, { valid: (id: string) => boolean; load: Lookup }> = {
  work: {
    valid: isOpenLibraryWorkId,
    load: async (id, origin) => {
      const w = await getWorkDetail(id);
      if (!w) return null;
      const description = describe(w.description, w.title);
      return { title: withAuthors(w), description, image: w.coverUrl, jsonLd: safeLd(() => workJsonLd(w, description, origin)) };
    },
  },
  book: {
    valid: isValidIsbn,
    load: async (id, origin) => {
      const b = await getBookDetail(id);
      if (!b) return null;
      const description = describe(b.description, b.title);
      return { title: withAuthors(b), description, image: b.coverUrl, jsonLd: safeLd(() => bookJsonLd(b, description, origin)) };
    },
  },
  author: {
    valid: isOpenLibraryAuthorId,
    load: async (id, origin) => {
      const a = await getAuthorDetail(id);
      if (!a) return null;
      const description = describe(a.bio, a.name);
      return { title: a.name, description, image: a.photoUrl ?? null, jsonLd: safeLd(() => authorJsonLd(a, description, origin)) };
    },
  },
  subject: {
    valid: (slug) => isSubjectSlugInput(slug),
    load: async (slug, origin) => {
      const s = await getSubjectDetail(slug);
      if (!s) return null;
      const description = describe(s.description, s.name);
      return { title: s.name, description, image: s.books[0]?.coverUrl ?? null, jsonLd: safeLd(() => subjectJsonLd(s, description, origin)) };
    },
  },
};

/** Card text for a web path, from public data only; null for anything unknown, malformed or not found. */
export async function pageMeta(path: string, origin = DEFAULT_WEB_ORIGIN): Promise<PageMeta | null> {
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
    const meta = await lookup.load(id, origin);
    // An explore page isn't the item's own page, so it gets the card but no JSON-LD.
    return meta && (explore ? { ...meta, title: `Explore ${meta.title}`, jsonLd: undefined } : meta);
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
    `<meta property="og:image:alt" content="${e(title)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${e(title)}" />`,
    `<meta name="twitter:description" content="${e(description)}" />`,
    `<meta name="twitter:image" content="${e(image)}" />`,
    ...(meta?.jsonLd ? [renderJsonLd(meta.jsonLd)] : []),
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
