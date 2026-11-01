import { describe, expect, it } from "vitest";
import { authorJsonLd, bookJsonLd, renderJsonLd, subjectJsonLd, workJsonLd } from "./structuredData.js";

const O = "https://site.test";
const book = {
  isbn: "9780441013593",
  title: "Dune",
  authors: [{ openLibraryId: "OL1A", name: "Frank Herbert" }],
  subjects: [{ label: "Deserts", sources: ["lcsh"] }],
  genres: [{ label: "Science fiction", sources: ["wikidata"] }],
  awards: ["Hugo Award"],
  description: "Long text",
  coverUrl: "https://c/dune.jpg",
  openLibraryWorkId: "OL1W",
  wikidataId: "Q190192",
  rating: { average: 4.3, count: 900, sources: ["hardcover"] },
  reviews: [{ rating: 5, text: "x", hasSpoilers: false }],
} as never;

describe("bookJsonLd", () => {
  it("describes the edition with links to its work and author pages", () => {
    expect(bookJsonLd(book, "Cut text", O)).toEqual({
      "@context": "https://schema.org",
      "@type": "Book",
      "@id": `${O}/book/9780441013593`,
      url: `${O}/book/9780441013593`,
      name: "Dune",
      description: "Cut text",
      image: "https://c/dune.jpg",
      isbn: "9780441013593",
      author: [{ "@type": "Person", name: "Frank Herbert", url: `${O}/author/OL1A` }],
      about: [{ "@type": "Thing", name: "Deserts" }],
      genre: ["Science fiction"],
      award: ["Hugo Award"],
      sameAs: ["https://www.wikidata.org/wiki/Q190192"],
      exampleOfWork: { "@type": "Book", "@id": `${O}/work/OL1W` },
    });
  });

  it("never marks up third-party ratings or reviews", () => {
    const ld = JSON.stringify(bookJsonLd(book, "d", O));
    expect(ld).not.toContain("aggregateRating");
    expect(ld).not.toContain("review");
  });

  it("omits empty and null fields", () => {
    const bare = {
      ...(book as object),
      authors: [],
      subjects: [],
      genres: [],
      awards: [],
      coverUrl: null,
      wikidataId: null,
      openLibraryWorkId: null,
    } as never;
    expect(Object.keys(bookJsonLd(bare, "d", O)).sort()).toEqual(["@context", "@id", "@type", "description", "isbn", "name", "url"]);
  });
});

it("workJsonLd: work page URL, no isbn or exampleOfWork", () => {
  const work = { openLibraryWorkId: "OL1W", title: "Dune", authors: [], subjects: [], genres: [], awards: [], coverUrl: null, isbn: "9780441013593" } as never;
  const ld = workJsonLd(work, "d", O);
  expect(ld.url).toBe(`${O}/work/OL1W`);
  expect(ld).not.toHaveProperty("isbn");
  expect(ld).not.toHaveProperty("exampleOfWork");
});

describe("authorJsonLd", () => {
  const author = {
    openLibraryId: "OL1A",
    name: "Ann",
    wikidataId: "Q1",
    bio: "b",
    bioSourceUrl: "https://en.wikipedia.org/wiki/Ann",
    photoUrl: "https://p/ann.jpg",
    birthDate: "1920-10-08",
    deathDate: "c. 1986",
    pseudonyms: ["A. N."],
    relations: [],
  } as never;

  it("is a Person with ISO dates only, pen names and sameAs links", () => {
    expect(authorJsonLd(author, "d", O)).toEqual({
      "@context": "https://schema.org",
      "@type": "Person",
      "@id": `${O}/author/OL1A`,
      url: `${O}/author/OL1A`,
      name: "Ann",
      description: "d",
      image: "https://p/ann.jpg",
      birthDate: "1920-10-08",
      alternateName: ["A. N."],
      sameAs: ["https://www.wikidata.org/wiki/Q1", "https://en.wikipedia.org/wiki/Ann"],
    });
  });

  it("keeps YYYY and YYYY-MM, drops anything else", () => {
    for (const [d, keep] of [["1920", true], ["1920-10", true], ["1920s", false], ["8 October 1920", false]] as const) {
      expect(authorJsonLd({ ...(author as object), birthDate: d } as never, "d", O).birthDate).toBe(keep ? d : undefined);
    }
  });
});

it("subjectJsonLd: CollectionPage listing at most 10 works", () => {
  const books = Array.from({ length: 12 }, (_, i) => ({ openLibraryWorkId: `OL${i}W`, title: `T${i}`, authors: [], coverUrl: null }));
  const ld = subjectJsonLd(
    { slug: "dragons", name: "Dragons", workCount: 12, wikidataId: null, description: null, relatedConcepts: [], books } as never,
    "d",
    O,
  );
  expect(ld["@type"]).toBe("CollectionPage");
  expect(ld.url).toBe(`${O}/subject/dragons`);
  expect(ld.about).toEqual({ "@type": "Thing", name: "Dragons" });
  const list = (ld.mainEntity as { itemListElement: unknown[] }).itemListElement;
  expect(list).toHaveLength(10);
  expect(list[0]).toEqual({ "@type": "ListItem", position: 1, item: { "@type": "Book", name: "T0", url: `${O}/work/OL0W` } });
});

it("renderJsonLd escapes < so text cannot close the script tag", () => {
  const html = renderJsonLd({ "@type": "Book", name: "</script><script>alert(1)</script><!--" });
  expect(html.startsWith('<script type="application/ld+json">')).toBe(true);
  expect(html.match(/<\/script>/g)).toHaveLength(1);
  expect(html).not.toContain("<!--");
  expect(JSON.parse(html.replace(/^<script[^>]*>|<\/script>$/g, "")).name).toBe("</script><script>alert(1)</script><!--");
});
