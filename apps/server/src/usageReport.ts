// `npm run usage-report`: pulls the server's pm2 logs over SSH and writes a private HTML dashboard.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

const TOP_N = 25;
const PARTIAL_SEARCH_WINDOW_MS = 30_000; // the app searches as you type, so "har" then "harry" is one search
const DAY_MS = 86_400_000;

type Ranked = [string, number][];
type TopKey = "works" | "books" | "authors" | "subjects" | "graphs";
type SearchMode = "title" | "author" | "subject";

export interface Summary {
  logLines: number;
  skippedLines: number;
  from: string | null;
  to: string | null;
  totalRequests: number;
  uniqueVisitors: number;
  crawlerRequests: number;
  rejected: number;
  rateLimited: number;
  days: { date: string; requests: number; visitors: number }[];
  searches: Record<SearchMode, Ranked>;
  failedSearches: Ranked;
  top: Record<TopKey, Ranked>;
  features: Ranked;
  routes: { route: string; count: number; serverErrors: number; slowestMs: number }[];
}

// Only the capture group of a matched path reaches the report, never a whole URL.
const ROUTES: { pattern: RegExp; route: string; feature: string; top?: TopKey }[] = [
  { pattern: /^\/api\/works\/([^/]+)$/, route: "/api/works/:id", feature: "Work pages", top: "works" },
  { pattern: /^\/api\/books\/isbn\/([^/]+)$/, route: "/api/books/isbn/:isbn", feature: "Book lookups by ISBN", top: "books" },
  { pattern: /^\/api\/authors\/([^/]+)$/, route: "/api/authors/:id", feature: "Author pages", top: "authors" },
  { pattern: /^\/api\/subjects\/([^/]+)$/, route: "/api/subjects/:slug", feature: "Subject pages", top: "subjects" },
  { pattern: /^\/api\/graph\/([^/]+\/[^/]+)$/, route: "/api/graph/:type/:id", feature: "Graph explorer", top: "graphs" },
  { pattern: /^\/api\/series\/[^/]+$/, route: "/api/series/:id", feature: "Series pages" },
  { pattern: /^\/api\/path$/, route: "/api/path", feature: "Shortest path" },
  { pattern: /^\/api\/search$/, route: "/api/search", feature: "Search" },
  { pattern: /^\/api\/search\/authors$/, route: "/api/search/authors", feature: "Autocomplete" },
  { pattern: /^\/api\/suggest\/[^/]+$/, route: "/api/suggest/:vocab", feature: "Autocomplete" },
  { pattern: /^\/api\/hardcover\//, route: "/api/hardcover/*", feature: "Hardcover" },
];

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function ranked(map: Map<string, number>): Ranked {
  return [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, TOP_N);
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function searchOf(params: URLSearchParams): { mode: SearchMode; term: string } | null {
  for (const [key, mode] of [["q", "title"], ["author", "author"], ["subject", "subject"]] as const) {
    const term = params.get(key)?.trim().toLowerCase();
    if (term) return { mode, term };
  }
  return null;
}

export async function summarize(lines: Iterable<string> | AsyncIterable<string>): Promise<Summary> {
  const pending = new Map<string, { method: unknown; url: string; ip: string }>();
  const visitors = new Set<string>();
  const dayRequests = new Map<string, number>();
  const dayVisitors = new Map<string, Set<string>>();
  const top = { works: new Map(), books: new Map(), authors: new Map(), subjects: new Map(), graphs: new Map() } as Record<TopKey, Map<string, number>>;
  const features = new Map<string, number>();
  const routes = new Map<string, Summary["routes"][number]>();
  const typed: { visitor: string; mode: SearchMode; term: string; time: number; ok: boolean }[] = [];
  let logLines = 0, skippedLines = 0, totalRequests = 0, crawlerRequests = 0, rejected = 0, rateLimited = 0;
  let firstTime = Infinity, lastTime = -Infinity;

  const record = (route: string, status: number, ms: number) => {
    const row = routes.get(route) ?? { route, count: 0, serverErrors: 0, slowestMs: 0 };
    row.count++;
    if (status >= 500) row.serverErrors++;
    row.slowestMs = Math.max(row.slowestMs, Math.round(ms));
    routes.set(route, row);
  };

  for await (const line of lines) {
    if (!line.trim()) continue;
    logLines++;
    let entry;
    try {
      // pm2 can prefix each line with a timestamp when log_date_format is set.
      entry = JSON.parse(line.slice(line.indexOf("{")));
    } catch {
      skippedLines++;
      continue;
    }
    // Keyed with pid because reqId restarts from req-1 whenever the server does.
    const key = `${entry.pid}:${entry.reqId}`;
    if (typeof entry.req?.url === "string") {
      pending.set(key, { method: entry.req.method, url: entry.req.url, ip: String(entry.req.remoteAddress) });
      continue;
    }
    const start = pending.get(key);
    if (typeof entry.res?.statusCode !== "number" || !start || !Number.isFinite(entry.time)) continue;
    pending.delete(key);

    const { method, url: rawUrl, ip } = start;
    const status: number = entry.res.statusCode;
    const ms = Number(entry.responseTime) || 0;
    const time: number = entry.time;
    firstTime = Math.min(firstTime, time);
    lastTime = Math.max(lastTime, time);

    // The web app's X-App-Key header makes browsers send a preflight before each request.
    if (method === "OPTIONS" || method === "HEAD") continue;
    let url: URL;
    try {
      url = new URL(rawUrl, "http://log.invalid");
    } catch {
      continue;
    }
    const path = url.pathname;
    if (path === "/health") continue;
    if (path === "/og" || path.startsWith("/og/")) {
      crawlerRequests++;
      continue;
    }
    if (status === 403) {
      rejected++;
      continue;
    }
    if (status === 429) rateLimited++;

    const match = ROUTES.map((r) => ({ r, m: r.pattern.exec(path) })).find((x) => x.m);
    if (!match) {
      record("(other)", status, ms);
      continue;
    }
    record(match.r.route, status, ms);
    totalRequests++;
    bump(features, match.r.feature);
    visitors.add(ip);
    const date = new Date(time).toISOString().slice(0, 10);
    bump(dayRequests, date);
    if (!dayVisitors.has(date)) dayVisitors.set(date, new Set());
    dayVisitors.get(date)!.add(ip);
    if (match.r.top && status < 400) bump(top[match.r.top], safeDecode(match.m![1]));
    if (match.r.route === "/api/search") {
      const search = searchOf(url.searchParams);
      if (search) typed.push({ visitor: ip, ...search, time, ok: status < 400 });
    }
  }

  // Sorted because rotated log files don't arrive in date order.
  typed.sort((a, b) => a.time - b.time);
  const lastByTyper = new Map<string, (typeof typed)[number]>();
  const partial = new Set<(typeof typed)[number]>();
  for (const s of typed) {
    const typer = `${s.visitor}:${s.mode}`;
    const prev = lastByTyper.get(typer);
    if (prev && s.time - prev.time <= PARTIAL_SEARCH_WINDOW_MS && s.term.length > prev.term.length && s.term.startsWith(prev.term)) partial.add(prev);
    lastByTyper.set(typer, s);
  }
  const searchCounts = { title: new Map(), author: new Map(), subject: new Map() } as Record<SearchMode, Map<string, number>>;
  const failed = new Map<string, number>();
  for (const s of typed) {
    if (partial.has(s)) continue;
    bump(s.ok ? searchCounts[s.mode] : failed, s.term);
  }

  const days: Summary["days"] = [];
  const dates = [...dayRequests.keys()].sort();
  if (dates.length) {
    // Quiet days stay on the chart as gaps instead of disappearing.
    const end = Date.parse(dates[dates.length - 1]);
    for (let t = Date.parse(dates[0]); t <= end; t += DAY_MS) {
      const date = new Date(t).toISOString().slice(0, 10);
      days.push({ date, requests: dayRequests.get(date) ?? 0, visitors: dayVisitors.get(date)?.size ?? 0 });
    }
  }

  return {
    logLines,
    skippedLines,
    from: Number.isFinite(firstTime) ? new Date(firstTime).toISOString() : null,
    to: Number.isFinite(lastTime) ? new Date(lastTime).toISOString() : null,
    totalRequests,
    uniqueVisitors: visitors.size,
    crawlerRequests,
    rejected,
    rateLimited,
    days,
    searches: { title: ranked(searchCounts.title), author: ranked(searchCounts.author), subject: ranked(searchCounts.subject) },
    failedSearches: ranked(failed),
    top: { works: ranked(top.works), books: ranked(top.books), authors: ranked(top.authors), subjects: ranked(top.subjects), graphs: ranked(top.graphs) },
    features: ranked(features),
    routes: [...routes.values()].sort((a, b) => b.count - a.count),
  };
}

// Search terms are typed by strangers, so everything from the logs goes through this.
function esc(value: string | number) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const n = (value: number) => value.toLocaleString("en-US");

function tile(label: string, value: number) {
  return `<div class="tile"><div class="value">${n(value)}</div><div class="label">${esc(label)}</div></div>`;
}

function rankedTable(title: string, rows: Ranked, note = "") {
  const max = rows[0]?.[1] ?? 1;
  const body = rows
    .map(([name, count]) => `<tr><td class="name">${esc(name)}</td><td class="num">${n(count)}</td><td class="meter" aria-hidden="true"><i style="width:${(count / max) * 100}%"></i></td></tr>`)
    .join("");
  return `<section><h2>${esc(title)}</h2>${note ? `<p class="note">${esc(note)}</p>` : ""}${
    rows.length ? `<table><thead><tr><th>Name</th><th class="num">Count</th><th aria-hidden="true"></th></tr></thead><tbody>${body}</tbody></table>` : `<p class="empty">None recorded.</p>`
  }</section>`;
}

function dayChart(title: string, unit: string, days: Summary["days"], value: (d: Summary["days"][number]) => number) {
  const max = Math.max(1, ...days.map(value));
  const bars = days
    .map((d) => `<div class="col" title="${d.date}: ${n(value(d))} ${unit}"><i style="height:${(value(d) / max) * 100}%"></i></div>`)
    .join("");
  return `<section><h2>${esc(title)}</h2><p class="note">Peak ${n(max)} ${unit} a day</p>
<div class="chart" role="img" aria-label="${esc(title)} by day, peak ${n(max)}">${bars}</div>
<div class="axis"><span>${days[0]?.date ?? ""}</span><span>${days[days.length - 1]?.date ?? ""}</span></div></section>`;
}

export function renderHtml(s: Summary, generatedOn: string) {
  const searchTotal = [...s.searches.title, ...s.searches.author, ...s.searches.subject].reduce((sum, [, count]) => sum + count, 0);
  const dayRows = [...s.days].reverse().map((d) => `<tr><td>${d.date}</td><td class="num">${n(d.requests)}</td><td class="num">${n(d.visitors)}</td></tr>`).join("");
  const routeRows = s.routes.map((r) => `<tr><td class="name">${esc(r.route)}</td><td class="num">${n(r.count)}</td><td class="num">${n(r.serverErrors)}</td><td class="num">${n(r.slowestMs)} ms</td></tr>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>ShelfThread usage</title>
<style>
:root{color-scheme:light;--bg:#f5f5f3;--surface:#fcfcfb;--text:#0b0b0b;--muted:#52514e;--line:#e2e1dc;--series:#2a78d6}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#111110;--surface:#1a1a19;--text:#f0efec;--muted:#c3c2b7;--line:#33322f;--series:#3987e5}}
*{box-sizing:border-box}
body{margin:0 auto;max-width:1040px;padding:32px 16px 64px;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,sans-serif}
h1{font-size:24px;margin:0}h2{font-size:15px;margin:0 0 8px}
.sub,.note,.empty,.axis,.label,th{color:var(--muted);font-size:13px}.sub,.note,.empty{margin:0 0 8px}
.tiles,.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));margin-top:12px}
.tiles{grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-top:24px}
.tile,section{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px;min-width:0}
.value{font-size:28px;font-weight:600;font-variant-numeric:tabular-nums}
.chart{display:flex;align-items:stretch;gap:2px;height:140px;border-bottom:1px solid var(--line)}
.col{flex:1 1 0;min-width:0;display:flex;align-items:flex-end}.col i{display:block;width:100%;max-width:24px;margin:auto auto 0;background:var(--series);border-radius:4px 4px 0 0}.col:hover{background:var(--line)}
.axis{display:flex;justify-content:space-between;margin-top:4px}
table{width:100%;border-collapse:collapse;table-layout:auto}th{text-align:left;font-weight:500}th,td{padding:4px 8px 4px 0;border-bottom:1px solid var(--line)}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.name{overflow-wrap:anywhere}
.meter{width:25%}.meter i{display:block;height:8px;background:var(--series);border-radius:0 4px 4px 0}
details{margin-top:12px}summary{cursor:pointer;color:var(--muted);font-size:13px}.full{margin-top:12px}
</style></head><body>
<h1>ShelfThread usage</h1>
<p class="sub">Generated ${esc(generatedOn)}. Logs cover ${esc(s.from?.slice(0, 10) ?? "nothing")} to ${esc(s.to?.slice(0, 10) ?? "nothing")}, grouped by UTC day. Contains what users searched for, so keep it private.</p>
<div class="tiles">${tile("API requests", s.totalRequests)}${tile("Unique visitors (by IP)", s.uniqueVisitors)}${tile("Searches", searchTotal)}${tile("Crawler requests", s.crawlerRequests)}</div>
<div class="grid">
${dayChart("Requests per day", "requests", s.days, (d) => d.requests)}
${dayChart("Visitors per day", "visitors", s.days, (d) => d.visitors)}
</div>
<details><summary>Show daily numbers as a table</summary><section class="full"><table><thead><tr><th>Date</th><th class="num">Requests</th><th class="num">Visitors</th></tr></thead><tbody>${dayRows}</tbody></table></section></details>
<div class="grid">
${rankedTable("Top title searches", s.searches.title)}
${rankedTable("Top author searches", s.searches.author)}
${rankedTable("Top subject searches", s.searches.subject)}
${rankedTable("Failed searches", s.failedSearches)}
${rankedTable("Features", s.features, "Requests per feature.")}
${rankedTable("Top works", s.top.works, "Requests, not page views: includes saved items the app loads in the background.")}
${rankedTable("Top books (ISBN)", s.top.books, "Requests, not page views: includes scans, imports and background loading.")}
${rankedTable("Top authors", s.top.authors)}
${rankedTable("Top subjects", s.top.subjects)}
${rankedTable("Top graphs", s.top.graphs)}
</div>
<section style="margin-top:12px"><h2>Health</h2><p class="note">${n(s.rateLimited)} rate limited (429), ${n(s.rejected)} rejected without a valid app key (403), ${n(s.skippedLines)} of ${n(s.logLines)} log lines were not JSON.</p>
${s.routes.length ? `<table><thead><tr><th>Route</th><th class="num">Requests</th><th class="num">5xx errors</th><th class="num">Slowest</th></tr></thead><tbody>${routeRows}</tbody></table>` : `<p class="empty">None recorded.</p>`}</section>
</body></html>
`;
}

/** The command run on the droplet. The name goes into a remote shell, so anything unusual is refused. */
export function remoteLogCommand(pm2Name: string) {
  if (!/^[\w.-]+$/.test(pm2Name)) throw new Error("USAGE_PM2_NAME may only contain letters, numbers, dots, dashes and underscores");
  // zcat -f also reads uncompressed files, so pm2-logrotate's .gz files work when present.
  return `zcat -f ~/.pm2/logs/${pm2Name}-out*`;
}

async function main() {
  const target = process.env.USAGE_SSH;
  const pm2Name = process.env.USAGE_PM2_NAME;
  if (!target || !pm2Name) throw new Error("Set USAGE_SSH (e.g. user@host) and USAGE_PM2_NAME (see `pm2 list`) in apps/server/.env");

  const ssh = spawn("ssh", ["-C", "--", target, remoteLogCommand(pm2Name)], { stdio: ["ignore", "pipe", "inherit"] });
  const exited = new Promise<number | null>((resolve, reject) => {
    ssh.on("error", reject);
    ssh.on("close", resolve);
  });
  const [summary, code] = await Promise.all([summarize(createInterface({ input: ssh.stdout, crlfDelay: Infinity })), exited]);
  if (code !== 0) throw new Error(`ssh exited with code ${code}; no report written`);
  if (summary.logLines === 0) throw new Error(`The logs for "${pm2Name}" were empty; no report written`);

  const today = new Date().toISOString().slice(0, 10);
  const dir = new URL("../reports/", import.meta.url);
  await mkdir(dir, { recursive: true });
  const file = fileURLToPath(new URL(`usage-${today}.html`, dir));
  await writeFile(file, renderHtml(summary, today));
  console.log(`Report: ${file}`);
  // shortcut: `open` is macOS only, on other systems open the printed path by hand.
  spawn("open", [file], { stdio: "ignore" }).on("error", () => {});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
