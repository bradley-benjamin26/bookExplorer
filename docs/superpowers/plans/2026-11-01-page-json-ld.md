# Per-Page JSON-LD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Book, work, author and subject pages each serve schema.org JSON-LD that describes their item, generated automatically from the same data the page shows.

**Architecture:** The server already renders per-page `<head>` tags for crawlers. `GET /og/<page path>` looks up the item (`pageMeta` in `apps/server/src/socialMeta.ts`) and puts the tags between the `<!-- social:start -->` / `<!-- social:end -->` markers in `index.html`. This plan adds one `<script type="application/ld+json">` to the same block, built from the same lookup, so the data is fetched only once. Caddy then also sends search-engine crawlers to `/og`, not only link-preview bots. Users still get the static site.

**Tech Stack:** Fastify, TypeScript, vitest, `@book-explorer/shared` types (`Book`, `Work`, `Author`, `Subject`).

**Spec:** The user's request (2026-11-01): "each major page automatically generates json-ld, schema.org markup for the page/item. I'm looking at book, subject, and author pages specifically." There is no separate design doc.

## Global Constraints

- The JSON-LD is generated server-side in the existing `/og` path. No client-side injection and no new dependency.
- Page URLs: `${origin}/book/<isbn>`, `${origin}/work/<OL…W>`, `${origin}/author/<OL…A>`, `${origin}/subject/<slug>`. `origin` defaults to `DEFAULT_WEB_ORIGIN` (`https://shelfthread.com`).
- Omit any property that has no value. Never emit `null`, `""` or `[]`.
- Never emit `aggregateRating` or `review`. The ratings come from Hardcover and Open Library, not from this site's users, and Google's review-snippet policy forbids marking those up.
- `description` in the JSON-LD is the same cut text as the meta description (`PageMeta.description`), not the full Wikipedia or Google Books text.
- The site-wide `WebSite` JSON-LD in `apps/app/public/index.html` sits outside the markers and stays as it is.

## Review Focus

1. A description or title containing `</script>` or `<!--` must not break out of the script tag. Every `<` in the serialized JSON becomes `<`. Test: Task 1.
2. Items with sparse data (no cover, no description, no authors, no Wikidata id) produce valid JSON-LD with those keys omitted, not set to null. Test: Task 1.
3. Author dates are free text from Wikidata or Open Library ("c. 1564", "1920s"). Only ISO-shaped values (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`) become `birthDate`/`deathDate`. Test: Task 1.
4. `/graph/...` explore pages are not the item's page, so they get the social card but no JSON-LD. Test: Task 2.
5. A failed, unknown or not-found lookup serves the default card with no per-page JSON-LD and no stale script. Test: Task 2.

---

### Task 1: JSON-LD builders and safe rendering

**Files:**
- Create: `apps/server/src/structuredData.ts`
- Test: `apps/server/src/structuredData.test.ts`

**Interfaces:**
- Consumes: the types `Book`, `Work`, `Author` and `Subject` from `@book-explorer/shared`.
- Produces:
  - `type JsonLd = Record<string, unknown>`
  - `bookJsonLd(b: Book, description: string, origin: string): JsonLd`
  - `workJsonLd(w: Work, description: string, origin: string): JsonLd`
  - `authorJsonLd(a: Author, description: string, origin: string): JsonLd`
  - `subjectJsonLd(s: Subject, description: string, origin: string): JsonLd`
  - `renderJsonLd(data: JsonLd): string`, which returns the full `<script type="application/ld+json">…</script>` tag

Shapes (every top-level object has `"@context": "https://schema.org"`):

| Builder | `@type` | Properties |
|---|---|---|
| book | `Book` | `@id` and `url` = book page URL; `name`; `description`; `image` = coverUrl; `isbn`; `author`; `about` = subjects as `{ "@type": "Thing", name }`; `genre` = genre labels; `award` = awards; `sameAs` = `https://www.wikidata.org/wiki/<wikidataId>`; `exampleOfWork` = `{ "@type": "Book", "@id": <work page URL> }` when `openLibraryWorkId` is set |
| work | `Book` | the same as book, minus `isbn`. `url` is the work page. No `exampleOfWork`. |
| author | `Person` | `@id`/`url`; `name`; `description`; `image` = photoUrl; `birthDate`/`deathDate` (ISO-shaped only); `alternateName` = pseudonyms; `sameAs` = Wikidata URL plus `bioSourceUrl` when set |
| subject | `CollectionPage` | `@id`/`url`; `name`; `description`; `about` = `{ "@type": "Thing", name, sameAs?: Wikidata URL }`; `mainEntity` = `{ "@type": "ItemList", itemListElement: [...] }` with the first 10 `books`, each `{ "@type": "ListItem", position: i+1, item: { "@type": "Book", name, url: <work page URL>, author? } }` |

`author` (in a book, work or list item) = `[{ "@type": "Person", name, url: <author page URL> }]`.
- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { authorJsonLd, bookJsonLd, renderJsonLd, subjectJsonLd, workJsonLd } from "./structuredData.js";

const O = "https://site.test";
const book = {
  isbn: "9780441013593", title: "Dune", authors: [{ openLibraryId: "OL1A", name: "Frank Herbert" }],
  subjects: [{ label: "Deserts", sources: ["lcsh"] }], genres: [{ label: "Science fiction", sources: ["wikidata"] }],
  awards: ["Hugo Award"], description: "Long text", coverUrl: "https://c/dune.jpg", openLibraryWorkId: "OL1W",
  wikidataId: "Q190192", rating: { average: 4.3, count: 900, sources: ["hardcover"] }, reviews: [{ rating: 5, text: "x", hasSpoilers: false }],
} as never;

describe("bookJsonLd", () => {
  it("describes the edition with links to its work and author pages", () => {
    expect(bookJsonLd(book, "Cut text", O)).toEqual({
      "@context": "https://schema.org", "@type": "Book",
      "@id": `${O}/book/9780441013593`, url: `${O}/book/9780441013593`,
      name: "Dune", description: "Cut text", image: "https://c/dune.jpg", isbn: "9780441013593",
      author: [{ "@type": "Person", name: "Frank Herbert", url: `${O}/author/OL1A` }],
      about: [{ "@type": "Thing", name: "Deserts" }], genre: ["Science fiction"], award: ["Hugo Award"],
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
    const bare = { ...(book as object), authors: [], subjects: [], genres: [], awards: [], coverUrl: null, wikidataId: null, openLibraryWorkId: null } as never;
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
  const author = { openLibraryId: "OL1A", name: "Ann", wikidataId: "Q1", bio: "b", bioSourceUrl: "https://en.wikipedia.org/wiki/Ann",
    photoUrl: "https://p/ann.jpg", birthDate: "1920-10-08", deathDate: "c. 1986", pseudonyms: ["A. N."], relations: [] } as never;

  it("is a Person with ISO dates only, pen names and sameAs links", () => {
    expect(authorJsonLd(author, "d", O)).toEqual({
      "@context": "https://schema.org", "@type": "Person", "@id": `${O}/author/OL1A`, url: `${O}/author/OL1A`,
      name: "Ann", description: "d", image: "https://p/ann.jpg", birthDate: "1920-10-08", alternateName: ["A. N."],
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
  const ld = subjectJsonLd({ slug: "dragons", name: "Dragons", workCount: 12, wikidataId: null, description: null, relatedConcepts: [], books } as never, "d", O);
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/server && npx vitest run src/structuredData.test.ts`
Expected: FAIL with `Failed to resolve import "./structuredData.js"`

- [ ] **Step 3: Implement the five functions in `apps/server/src/structuredData.ts`**

Use one small `compact(obj)` helper that drops `null`, `undefined`, `""` and empty arrays, and apply it to every object you build. ISO date check: `/^\d{4}(-\d{2}(-\d{2})?)?$/`. `renderJsonLd` = `JSON.stringify(data).replace(/</g, "\\u003c")` wrapped in the script tag. Book and work share one private builder; the book builder adds `isbn` and `exampleOfWork`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/server && npx vitest run src/structuredData.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/structuredData.ts apps/server/src/structuredData.test.ts
git commit -m "feat(server): schema.org JSON-LD builders for book, work, author and subject pages"
```

---

### Task 2: Serve the JSON-LD from `/og` and send search crawlers there

**Files:**
- Modify: `apps/server/src/socialMeta.ts` (`PageMeta`, `LOOKUPS`, `pageMeta`, `renderSocialTags`)
- Modify: `apps/server/src/routes/og.ts` (pass `origin` to `pageMeta`)
- Modify: `docs/deploy-social-cards.md` (Caddy `@preview` User-Agent regex, "Check it" section)
- Test: `apps/server/src/socialMeta.test.ts`, `apps/server/src/routes/og.test.ts`

**Interfaces:**
- Consumes: the Task 1 builders and `renderJsonLd(data: JsonLd): string`.
- Produces:
  - `PageMeta` gains `jsonLd?: JsonLd`.
  - `pageMeta(path: string, origin = DEFAULT_WEB_ORIGIN): Promise<PageMeta | null>`. `LOOKUPS[type].load` becomes `(id, origin) => …`, and each one calls its builder with the `description` it already computes.
  - `renderSocialTags` appends `renderJsonLd(meta.jsonLd)` as the last line when `meta?.jsonLd` is set.

- [ ] **Step 1: Write the failing tests**

In `socialMeta.test.ts`:

```ts
it("item pages carry JSON-LD built with the given origin", async () => {
  vi.mocked(getAuthorDetail).mockResolvedValue({ openLibraryId: "OL1A", name: "Ann", bio: "b", pseudonyms: [], relations: [] } as never);
  const meta = await pageMeta("/author/OL1A", "https://site.test");
  expect(meta?.jsonLd).toMatchObject({ "@type": "Person", url: "https://site.test/author/OL1A", description: "b" });
});

it("graph explore pages get a card but no JSON-LD", async () => {
  vi.mocked(getWorkDetail).mockResolvedValue({ ...work, openLibraryWorkId: "OL1W", subjects: [], genres: [], awards: [] } as never);
  expect((await pageMeta("/graph/work/OL1W"))?.jsonLd).toBeUndefined();
});

it("renderSocialTags emits the script only when there is JSON-LD", () => {
  const base = { title: "T", description: "d", image: null };
  expect(renderSocialTags(base, "u")).not.toContain("ld+json");
  expect(renderSocialTags(null, "u")).not.toContain("ld+json");
  expect(renderSocialTags({ ...base, jsonLd: { "@type": "Book" } }, "u")).toContain('<script type="application/ld+json">{"@type":"Book"}</script>');
});
```

In `og.test.ts`: change the existing `expect(pageMeta).toHaveBeenCalledWith("/work/OL1W")` to `toHaveBeenCalledWith("/work/OL1W", "https://site.test")`, and add:

```ts
it("serves the page's JSON-LD inside the social block; the default card has none", async () => {
  lookup = async () => ({ title: "Dune", description: "Sand.", image: null, jsonLd: { "@type": "Book", name: "Dune" } });
  expect((await get("/og/work/OL1W")).body).toContain('"@type":"Book"');
  lookup = async () => null;
  expect((await get("/og/work/OL1W")).body).not.toContain("ld+json");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/server && npx vitest run src/socialMeta.test.ts src/routes/og.test.ts`
Expected: FAIL. The new tests fail on missing `jsonLd`/script, and the call-args test fails with a missing second argument.

- [ ] **Step 3: Implement the changes in `socialMeta.ts` and `og.ts`**

In `pageMeta`, drop `jsonLd` on the explore path (`{ ...meta, title: …, jsonLd: undefined }`). In `og.ts`, call `pageMeta(path, origin)`.

- [ ] **Step 4: Update `docs/deploy-social-cards.md`**

- Add `googlebot|bingbot|duckduckbot|applebot|yandexbot` to the `@preview` User-Agent regex.
- In the intro, say the route also serves schema.org JSON-LD for search engines.
- Under "Check it", add: `curl -s -A Googlebot --resolve shelfthread.com:443:127.0.0.1 https://shelfthread.com/author/OL26320A | grep ld+json`, then paste a page URL into Google's Rich Results Test (search.google.com/test/rich-results).

- [ ] **Step 5: Run the whole server suite**

Run: `cd apps/server && npx vitest run && npx tsc --noEmit`
Expected: all tests pass and there are no type errors. Existing `socialMeta.test.ts` fixtures that mock partial details may need the array fields (`subjects`, `genres`, `awards`, `pseudonyms`, `books`) added, because the builders now read them.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/socialMeta.ts apps/server/src/socialMeta.test.ts apps/server/src/routes/og.ts apps/server/src/routes/og.test.ts docs/deploy-social-cards.md
git commit -m "feat(server): serve per-page JSON-LD to search crawlers via /og"
```
