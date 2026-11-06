import { describe, expect, it } from "vitest";
import { remoteLogCommand, renderHtml, summarize } from "./usageReport.js";

describe("remoteLogCommand", () => {
  it("reads current and rotated pm2 logs", () => {
    expect(remoteLogCommand("book-api")).toBe("zcat -f ~/.pm2/logs/book-api-out*");
  });

  it("refuses a name that could run a shell command", () => {
    expect(() => remoteLogCommand("x; rm -rf ~")).toThrow(/USAGE_PM2_NAME/);
  });
});

const BASE = Date.UTC(2026, 10, 3, 12);
let nextId = 0;

function incoming(url: string, opts: { ip?: string; at?: number; id?: string; method?: string; pid?: number } = {}) {
  return JSON.stringify({
    level: 30,
    time: BASE + (opts.at ?? 0),
    pid: opts.pid ?? 1,
    hostname: "droplet",
    reqId: opts.id ?? "req-1",
    req: { method: opts.method ?? "GET", url, host: "api.shelfthread.com", remoteAddress: opts.ip ?? "1.1.1.1", remotePort: 5 },
    msg: "incoming request",
  });
}

function completed(status = 200, opts: { at?: number; id?: string; ms?: number; pid?: number } = {}) {
  return JSON.stringify({
    level: 30,
    time: BASE + (opts.at ?? 0) + 5,
    pid: opts.pid ?? 1,
    hostname: "droplet",
    reqId: opts.id ?? "req-1",
    res: { statusCode: status },
    responseTime: opts.ms ?? 10,
    msg: "request completed",
  });
}

/** One finished request, with a fresh reqId so calls can be chained. */
function hit(url: string, opts: { status?: number; ip?: string; at?: number; method?: string; ms?: number } = {}) {
  const id = `req-${++nextId}`;
  return [incoming(url, { ...opts, id }), completed(opts.status ?? 200, { ...opts, id })];
}

describe("summarize: parsing", () => {
  it("pairs a restarted server's reused reqId with the newest request", async () => {
    const s = await summarize([
      incoming("/api/works/OL1W", { id: "req-1" }), // server died before answering
      incoming("/api/works/OL2W", { id: "req-1", at: 1000 }),
      completed(200, { id: "req-1", at: 1000 }),
    ]);
    expect(s.top.works).toEqual([["OL2W", 1]]);
  });

  it("skips non-JSON lines and counts them", async () => {
    const s = await summarize(["[openLibrary] Could not parse author id", "{broken", ...hit("/api/works/OL1W")]);
    expect(s.totalRequests).toBe(1);
    expect(s.skippedLines).toBe(2);
  });

  it("reads JSON behind a pm2 timestamp prefix", async () => {
    const [req, res] = hit("/api/works/OL1W");
    const s = await summarize([`2026-11-03T12:00:00: ${req}`, `2026-11-03T12:00:00: ${res}`]);
    expect(s.totalRequests).toBe(1);
  });
});

describe("summarize: what counts as usage", () => {
  it("ignores health checks and CORS preflights", async () => {
    const s = await summarize([...hit("/health"), ...hit("/api/works/OL1W", { method: "OPTIONS" })]);
    expect(s.totalRequests).toBe(0);
    expect(s.routes).toEqual([]);
  });

  it("counts 403s as rejected, not usage", async () => {
    const s = await summarize(hit("/api/works/OL1W", { status: 403 }));
    expect(s.totalRequests).toBe(0);
    expect(s.top.works).toEqual([]);
    expect(s.rejected).toBe(1);
  });

  it("counts /og as crawler traffic, not usage", async () => {
    const s = await summarize(hit("/og/work/OL1W"));
    expect(s.crawlerRequests).toBe(1);
    expect(s.totalRequests).toBe(0);
    expect(s.uniqueVisitors).toBe(0);
  });

  it("does not repeat unknown paths in the report", async () => {
    const s = await summarize(hit("/wp-admin/setup.php", { status: 404 }));
    expect(s.routes).toEqual([{ route: "(other)", count: 1, serverErrors: 0, slowestMs: 10 }]);
    expect(renderHtml(s, "2026-11-05")).not.toContain("wp-admin");
  });

  it("buckets requests and unique visitors by UTC day", async () => {
    const day = 86_400_000;
    const s = await summarize([
      ...hit("/api/works/A", { ip: "1.1.1.1" }),
      ...hit("/api/works/B", { ip: "1.1.1.1" }),
      ...hit("/api/works/C", { ip: "2.2.2.2" }),
      ...hit("/api/works/D", { ip: "1.1.1.1", at: day }),
    ]);
    expect(s.days).toEqual([
      { date: "2026-11-03", requests: 3, visitors: 2 },
      { date: "2026-11-04", requests: 1, visitors: 1 },
    ]);
    expect(s.uniqueVisitors).toBe(2);
  });

  it("groups top items and features by route, ranked by count", async () => {
    const s = await summarize([
      ...hit("/api/works/OL1W"),
      ...hit("/api/works/OL2W"),
      ...hit("/api/works/OL2W"),
      ...hit("/api/books/isbn/9780000000000"),
      ...hit("/api/authors/OL1A"),
      ...hit("/api/subjects/magic"),
      ...hit("/api/graph/work/OL1W"),
      ...hit("/api/path?from=a&to=b"),
      ...hit("/api/hardcover/session"),
    ]);
    expect(s.top.works).toEqual([["OL2W", 2], ["OL1W", 1]]);
    expect(s.top.books).toEqual([["9780000000000", 1]]);
    expect(s.top.authors).toEqual([["OL1A", 1]]);
    expect(s.top.subjects).toEqual([["magic", 1]]);
    expect(s.top.graphs).toEqual([["work/OL1W", 1]]);
    expect(s.features).toContainEqual(["Graph explorer", 1]);
    expect(s.features).toContainEqual(["Shortest path", 1]);
    expect(s.features).toContainEqual(["Hardcover", 1]);
    expect(s.features).toContainEqual(["Book lookups by ISBN", 1]);
  });

  it("reports server errors, rate limits and slowest time per route", async () => {
    const s = await summarize([
      ...hit("/api/works/A", { status: 503, ms: 900 }),
      ...hit("/api/works/B", { ms: 20 }),
      ...hit("/api/works/C", { status: 429 }),
    ]);
    expect(s.routes).toEqual([{ route: "/api/works/:id", count: 3, serverErrors: 1, slowestMs: 900 }]);
    expect(s.rateLimited).toBe(1);
  });
});

describe("summarize: searches", () => {
  const q = (term: string) => `/api/search?q=${encodeURIComponent(term)}`;

  it("splits searches by mode and merges case and spacing", async () => {
    const s = await summarize([
      ...hit(q("Dune"), { ip: "1.1.1.1" }),
      ...hit(q(" dune "), { ip: "2.2.2.2" }),
      ...hit("/api/search?author=Le%20Guin"),
      ...hit("/api/search?subject=magic"),
    ]);
    expect(s.searches.title).toEqual([["dune", 2]]);
    expect(s.searches.author).toEqual([["le guin", 1]]);
    expect(s.searches.subject).toEqual([["magic", 1]]);
  });

  it("collapses partial searches typed by one visitor", async () => {
    const s = await summarize([
      ...hit(q("har"), { at: 0 }),
      ...hit(q("harry"), { at: 1000 }),
      ...hit(q("harry potter"), { at: 2000 }),
    ]);
    expect(s.searches.title).toEqual([["harry potter", 1]]);
  });

  it("collapses partials even when rotated log files arrive out of order", async () => {
    const s = await summarize([...hit(q("harry"), { at: 1000 }), ...hit(q("har"), { at: 0 })]);
    expect(s.searches.title).toEqual([["harry", 1]]);
  });

  it("keeps a prefix searched by another visitor, or long before", async () => {
    const s = await summarize([
      ...hit(q("har"), { ip: "1.1.1.1", at: 0 }),
      ...hit(q("harry"), { ip: "2.2.2.2", at: 1000 }),
      ...hit(q("dun"), { at: 0 }),
      ...hit(q("dune"), { at: 31_000 }),
    ]);
    expect(s.searches.title).toContainEqual(["har", 1]);
    expect(s.searches.title).toContainEqual(["dun", 1]);
  });

  it("does not count autocomplete as searches", async () => {
    const s = await summarize([...hit("/api/search/authors?q=tolk"), ...hit("/api/suggest/subjects?q=mag")]);
    expect(s.searches.title).toEqual([]);
    expect(s.searches.author).toEqual([]);
  });

  it("lists failed searches apart from top searches", async () => {
    const s = await summarize(hit(q("dune"), { status: 503 }));
    expect(s.searches.title).toEqual([]);
    expect(s.failedSearches).toEqual([["dune", 1]]);
  });
});

describe("renderHtml", () => {
  it("escapes search terms so a typed script cannot run", async () => {
    const term = `<script>alert("x")</script>`;
    const html = renderHtml(await summarize(hit(`/api/search?q=${encodeURIComponent(term)}`)), "2026-11-05");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("never writes IPs or OAuth values", async () => {
    const s = await summarize([
      ...hit("/api/hardcover/callback?code=SECRETCODE&state=SECRETSTATE", { ip: "203.0.113.9" }),
      ...hit("/api/search?q=dune&token=SECRETTOKEN", { ip: "203.0.113.9" }),
    ]);
    const output = JSON.stringify(s) + renderHtml(s, "2026-11-05");
    for (const secret of ["SECRETCODE", "SECRETSTATE", "SECRETTOKEN", "203.0.113.9"]) expect(output).not.toContain(secret);
  });
});
