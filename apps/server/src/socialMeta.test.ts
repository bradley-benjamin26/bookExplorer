import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./services/workService.js", () => ({ getWorkDetail: vi.fn() }));
vi.mock("./services/bookService.js", () => ({ getBookDetail: vi.fn() }));
vi.mock("./services/authorService.js", () => ({ getAuthorDetail: vi.fn() }));
vi.mock("./services/subjectService.js", () => ({ getSubjectDetail: vi.fn() }));

import { getWorkDetail } from "./services/workService.js";
import { getBookDetail } from "./services/bookService.js";
import { getAuthorDetail } from "./services/authorService.js";
import { getSubjectDetail } from "./services/subjectService.js";
import { injectSocialTags, pageMeta, renderSocialTags } from "./socialMeta.js";

const work = {
  title: "Dune",
  authors: [{ name: "Frank Herbert" }, { name: "Brian Herbert" }],
  description: "word ".repeat(100).trim(),
  coverUrl: "https://covers.example/dune.jpg",
};

beforeEach(() => vi.clearAllMocks());

describe("pageMeta", () => {
  it("work page: title with authors, cut description, cover image", async () => {
    vi.mocked(getWorkDetail).mockResolvedValue(work as never);
    const meta = await pageMeta("/work/OL1W");
    expect(meta?.title).toBe("Dune by Frank Herbert, Brian Herbert");
    expect(meta?.image).toBe("https://covers.example/dune.jpg");
    expect(meta!.description.length).toBeLessThanOrEqual(201);
    expect(meta!.description.endsWith("…")).toBe(true);
    expect(meta!.description).not.toMatch(/ …$/);
  });

  it("uses the default description when there is none", async () => {
    vi.mocked(getAuthorDetail).mockResolvedValue({ name: "Ann", bio: null } as never);
    const meta = await pageMeta("/author/OL1A");
    expect(meta).toMatchObject({
      title: "Ann",
      description: "Explore Ann on Shelf Thread: its authors, subjects and connections.",
      image: null,
    });
  });

  it("author page uses the photo when there is one", async () => {
    vi.mocked(getAuthorDetail).mockResolvedValue({ name: "Ann", bio: "b", photoUrl: "https://p/ann.jpg" } as never);
    expect((await pageMeta("/author/OL1A"))?.image).toBe("https://p/ann.jpg");
  });

  it("subject page uses the first book's cover; book page uses its isbn lookup", async () => {
    vi.mocked(getSubjectDetail).mockResolvedValue({
      name: "Dragons",
      description: "Big.",
      books: [{ coverUrl: "https://c/1.jpg" }],
    } as never);
    expect((await pageMeta("/subject/dragons"))?.image).toBe("https://c/1.jpg");
    vi.mocked(getBookDetail).mockResolvedValue({ ...work } as never);
    expect((await pageMeta("/book/9780141439518"))?.title).toContain("Dune by");
  });

  it("graph path prefixes Explore", async () => {
    vi.mocked(getWorkDetail).mockResolvedValue(work as never);
    expect((await pageMeta("/graph/work/OL1W"))?.title).toBe("Explore Dune by Frank Herbert, Brian Herbert");
  });

  it("invalid id or unknown path → null, no service call", async () => {
    for (const p of ["/work/nope", "/book/123", "/author/OL1W", "/subject/, --", "/graph/x/OL1W", "/other", "/", "/work/OL1W/extra"]) {
      expect(await pageMeta(p)).toBeNull();
    }
    expect(getWorkDetail).not.toHaveBeenCalled();
    expect(getBookDetail).not.toHaveBeenCalled();
    expect(getAuthorDetail).not.toHaveBeenCalled();
    expect(getSubjectDetail).not.toHaveBeenCalled();
  });

  it("malformed percent-encoding → null instead of throwing", async () => {
    expect(await pageMeta("/work/%E0%A4%A")).toBeNull();
  });

  it("failed lookup or null detail → null", async () => {
    vi.mocked(getWorkDetail).mockResolvedValue(null);
    expect(await pageMeta("/work/OL1W")).toBeNull();
    vi.mocked(getWorkDetail).mockRejectedValue(new Error("boom"));
    expect(await pageMeta("/work/OL1W")).toBeNull();
  });
});

describe("renderSocialTags", () => {
  it("escapes quotes and tags in every value", () => {
    const html = renderSocialTags(
      { title: 'Dune "<script>"', description: `a & b 'c' <i>`, image: 'https://x/"y' },
      'https://shelfthread.com/work/OL1W?"><script>',
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<i>");
    expect(html).toContain("&quot;&lt;script&gt;&quot;");
    // Every attribute value stays inside its quotes: no raw " between a content=" and its closing ".
    for (const m of html.matchAll(/content="([^"]*)"/g)) expect(m[1]).not.toMatch(/["<>]/);
  });

  it("no meta → site defaults with og-image.png", () => {
    const html = renderSocialTags(null, "https://shelfthread.com/");
    expect(html).toContain("<title>Shelf Thread</title>");
    expect(html).toContain("https://shelfthread.com/og-image.png");
    expect(html).toContain('property="og:site_name"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
  });

  it("og:image:alt is the escaped title", () => {
    const html = renderSocialTags({ title: 'Dune "x"', description: "d", image: "https://c/1.jpg" }, "https://shelfthread.com/");
    expect(html).toContain('<meta property="og:image:alt" content="Dune &quot;x&quot; · Shelf Thread" />');
  });
});

describe("injectSocialTags", () => {
  it("injects between the markers, or before </head> without them", () => {
    const marked = "<head><!-- social:start -->OLD<!-- social:end --></head>";
    expect(injectSocialTags(marked, "NEW")).toBe("<head><!-- social:start -->NEW<!-- social:end --></head>");
    expect(injectSocialTags("<head></head>", "NEW")).toBe("<head>NEW</head>");
  });

  it("keeps $ patterns in the tags literal", () => {
    const out = injectSocialTags("<head><!-- social:start --><!-- social:end --></head>", "$& $1 $$ $`");
    expect(out).toContain("$& $1 $$ $`");
    expect(injectSocialTags("<head></head>", "$&")).toBe("<head>$&</head>");
  });
});

describe("JSON-LD", () => {
  it("item pages carry JSON-LD built with the given origin", async () => {
    vi.mocked(getAuthorDetail).mockResolvedValue({ openLibraryId: "OL1A", name: "Ann", bio: "b", pseudonyms: [], relations: [] } as never);
    const meta = await pageMeta("/author/OL1A", "https://site.test");
    expect(meta?.jsonLd).toMatchObject({ "@type": "Person", url: "https://site.test/author/OL1A", description: "b" });
  });

  it("graph explore pages get a card but no JSON-LD", async () => {
    vi.mocked(getWorkDetail).mockResolvedValue({ ...work, openLibraryWorkId: "OL1W", subjects: [], genres: [], awards: [] } as never);
    const meta = await pageMeta("/graph/work/OL1W");
    expect(meta?.title).toMatch(/^Explore /);
    expect(meta?.jsonLd).toBeUndefined();
  });

  it("renderSocialTags emits the script only when there is JSON-LD", () => {
    const base = { title: "T", description: "d", image: null };
    expect(renderSocialTags(base, "u")).not.toContain("ld+json");
    expect(renderSocialTags(null, "u")).not.toContain("ld+json");
    expect(renderSocialTags({ ...base, jsonLd: { "@type": "Book" } }, "u")).toContain('<script type="application/ld+json">{"@type":"Book"}</script>');
  });
});

it("a detail the JSON-LD builder can't read still gets its card", async () => {
  vi.mocked(getWorkDetail).mockResolvedValue(work as never); // no subjects/genres/awards arrays
  const meta = await pageMeta("/work/OL1W");
  expect(meta?.title).toBe("Dune by Frank Herbert, Brian Herbert");
  expect(meta?.jsonLd).toBeUndefined();
});
