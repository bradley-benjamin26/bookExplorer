import type { Author, AuthorRef, Book, Subject, Work } from "@book-explorer/shared";

/** schema.org JSON-LD for the web app's item pages, served to crawlers by the /og route. */
export type JsonLd = Record<string, unknown>;

const CONTEXT = "https://schema.org";
const ISO_DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const MAX_LIST = 10;

const wikidata = (id: string | null | undefined) => id && `https://www.wikidata.org/wiki/${id}`;

/** Drops null, undefined, "" and [] so absent data leaves no key. */
function compact(obj: JsonLd): JsonLd {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0)),
  );
}

const people = (authors: AuthorRef[], origin: string) =>
  authors.map((a) => ({ "@type": "Person", name: a.name, url: `${origin}/author/${a.openLibraryId}` }));

// Ratings and reviews are deliberately left out: they come from Hardcover and
// Open Library, not this site's users, which Google's review-snippet policy forbids marking up.
function bookLike(d: Book | Work, url: string, description: string, origin: string): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "Book",
    "@id": url,
    url,
    name: d.title,
    description,
    image: d.coverUrl,
    author: people(d.authors, origin),
    about: d.subjects.map((s) => ({ "@type": "Thing", name: s.label })),
    genre: d.genres.map((g) => g.label),
    award: d.awards,
    sameAs: [wikidata("wikidataId" in d ? d.wikidataId : null)].filter(Boolean),
  };
}

export function bookJsonLd(b: Book, description: string, origin: string): JsonLd {
  return compact({
    ...bookLike(b, `${origin}/book/${b.isbn}`, description, origin),
    isbn: b.isbn,
    exampleOfWork: b.openLibraryWorkId ? { "@type": "Book", "@id": `${origin}/work/${b.openLibraryWorkId}` } : null,
  });
}

export function workJsonLd(w: Work, description: string, origin: string): JsonLd {
  return compact(bookLike(w, `${origin}/work/${w.openLibraryWorkId}`, description, origin));
}

export function authorJsonLd(a: Author, description: string, origin: string): JsonLd {
  const url = `${origin}/author/${a.openLibraryId}`;
  const date = (d: string | null) => (d && ISO_DATE.test(d) ? d : null);
  return compact({
    "@context": CONTEXT,
    "@type": "Person",
    "@id": url,
    url,
    name: a.name,
    description,
    image: a.photoUrl,
    birthDate: date(a.birthDate),
    deathDate: date(a.deathDate),
    alternateName: a.pseudonyms,
    sameAs: [wikidata(a.wikidataId), a.bioSourceUrl].filter(Boolean),
  });
}

export function subjectJsonLd(s: Subject, description: string, origin: string): JsonLd {
  const url = `${origin}/subject/${s.slug}`;
  return compact({
    "@context": CONTEXT,
    "@type": "CollectionPage",
    "@id": url,
    url,
    name: s.name,
    description,
    about: compact({ "@type": "Thing", name: s.name, sameAs: wikidata(s.wikidataId) }),
    mainEntity: s.books.length
      ? {
          "@type": "ItemList",
          itemListElement: s.books.slice(0, MAX_LIST).map((w, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: compact({ "@type": "Book", name: w.title, url: `${origin}/work/${w.openLibraryWorkId}`, author: people(w.authors, origin) }),
          })),
        }
      : null,
  });
}

/** `<` is escaped so no text in the data can close the script tag or open a comment. */
export function renderJsonLd(data: JsonLd): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}
