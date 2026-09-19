# Pair Programming Review — Phases 1–4

A transcript of a review pass over the whole codebase after Phase 4 (the graph explorer) landed. Structured as it happened: read a file, find something, verify it against the running server, fix it, move on. Every finding below was reproduced against the live app before being called a bug — not just inferred from reading the code.

---

**Reviewer A:** Let's start at the bottom of the stack, `cache.ts`, since almost everything else depends on it.

**Reviewer B:** `TtlCache.wrap()` — cache miss, call `fetcher()`, cache the result. Simple. But there's no protection against two concurrent callers missing the cache for the same key at the same time.

**Reviewer A:** Walk through it — two requests for the same uncached author hit the route within milliseconds of each other. Both call `wrap()`, both see `get(key)` return `undefined`, both call `fetcher()` independently.

**Reviewer B:** Which for an author means two full Open Library + Wikidata round trips for what's semantically one request. Wikidata's SPARQL endpoint is rate-limited, so this is the kind of thing that turns "works fine in testing" into "breaks under two people scanning the same book at once."

**Reviewer A:** Fix: track in-flight promises per key, so a concurrent caller awaits the same promise instead of starting a new fetch.

```ts
async wrap(key: string, fetcher: () => Promise<T>): Promise<T> {
  const cached = this.get(key);
  if (cached !== undefined) return cached;

  const inFlight = this.pending.get(key);
  if (inFlight) return inFlight;

  const promise = fetcher()
    .then((value) => { this.set(key, value); return value; })
    .finally(() => this.pending.delete(key));

  this.pending.set(key, promise);
  return promise;
}
```

**Reviewer B:** That's safe because everything before the first `await` runs synchronously — no interleaving can happen between the `pending.get()` check and the `pending.set()` call.

**Reviewer A:** Verified: 5 parallel `curl` requests against a cold `/api/authors/:id` completed together rather than serially duplicating work.

**Fixed** — [apps/server/src/cache.ts](../apps/server/src/cache.ts)

---

**Reviewer B:** Next, `wikidata.ts`. `fetchAuthorRelations(qid)` and `fetchRelatedConcepts(qid)` splice `qid` straight into a SPARQL query string: `` wd:${qid} wdt:P737 ?item ``.

**Reviewer A:** Where does `qid` come from?

**Reviewer B:** Two places. Wikidata's own search API — always a clean `Q12345` — or Open Library's `remote_ids.wikidata` field.

**Reviewer A:** And Open Library is a public wiki. Anyone can edit an author record and put anything in that field.

**Reviewer B:** Right, so an untrusted, free-text value flows unescaped into a query string. That's a SPARQL injection surface against Wikidata's public endpoint — low blast radius since it's read-only and not our data, but it's real and cheap to close.

**Reviewer A:** Validate the shape before it ever reaches a query:

```ts
function isValidQid(qid: string): boolean {
  return /^Q[1-9]\d*$/.test(qid);
}
```

Both fetch functions bail out to an empty result immediately if the id doesn't match — same "no match" path the UI already handles for an author/subject with no Wikidata link at all, so no new failure mode to design for.

**Fixed** — [apps/server/src/sources/wikidata.ts](../apps/server/src/sources/wikidata.ts)

---

**Reviewer A:** `openLibrary.ts` next. `extractAuthorId` throws if it can't parse an `OL...A` id out of an author URL.

**Reviewer B:** And it's called inside a `.map()` over every author on a book. One malformed entry — and Open Library's data is messy enough that this isn't hypothetical, we've already seen stray unescaped quotes and inconsistent formatting in subject strings from the same dataset — throws inside the `.map()`, which crashes `lookupByIsbn` entirely.

**Reviewer A:** So a book with five good authors and one weird one returns nothing instead of the five good ones.

**Reviewer B:** Changed it to return `null` and log a warning instead of throwing; the caller filters the null out with `.flatMap()`. Same pattern applied to `getSubject`'s work-entry parsing, which had the identical shape of risk (`w.key.replace(...)` assumes `key` exists).

**Reviewer A:** And the other silent-failure shape in this file: `getWork`'s author name resolution.

```ts
const author = await getAuthor(id).catch(() => null);
return { openLibraryId: id, name: author?.name ?? id };
```

If `getAuthor` fails for any reason — a timeout, a transient error — this falls back to using the raw id (`"OL21594A"`) as the person's display name. Nothing errors, nothing logs. The UI just quietly shows a garbled name where a real one should be.

**Reviewer B:** That's exactly the "fails without being noticed" case. Added a `console.warn` in the catch so it's visible in server logs when it happens, and left a comment explaining the fallback is deliberately shown as an obviously-wrong id string rather than something that could pass for a real name.

**Fixed** — [apps/server/src/sources/openLibrary.ts](../apps/server/src/sources/openLibrary.ts)

---

**Reviewer A:** Now a real gap, not just a robustness issue. `routes/books.ts` hardcodes `openLibraryWorkId: null` on every response.

**Reviewer B:** Checked — is that actually unpopulatable, or are we just throwing away data we have?

**Reviewer A:**
```
$ curl .../api/volumes/brief/isbn/9780141439518.json | jq '.records[].data | keys'
["url","key","title","authors",...,"cover"]
```
No work reference in that response at all. But `data.key` is the *edition* key (`/books/OL...M`), and fetching that edition directly —
```
$ curl .../books/OL37076991M.json | jq '.works'
[{"key": "/works/OL66554W"}]
```
— does have it.

**Reviewer B:** So it's a real, if non-obvious, gap: one extra request on a cache miss gets us a field the type already promises (`Book.openLibraryWorkId: string | null`) but the code never actually filled in. And it matters more now than it did before Phase 4 — without a work id, a book scanned by barcode has no path into the graph explorer at all, while author/subject/work screens all do.

**Reviewer A:** Added `resolveWorkId()`, non-fatal on failure (the rest of the book is still useful without it), wired the result through, and added a "View as Graph" button to the book screen now that the id is actually there.

**Reviewer B:** Verified: `openLibraryWorkId` on *Pride and Prejudice* went from `null` to `"OL66554W"`.

**Fixed** — [apps/server/src/sources/openLibrary.ts](../apps/server/src/sources/openLibrary.ts), [apps/server/src/services/bookService.ts](../apps/server/src/services/bookService.ts) (new — see refactor note below), [apps/app/app/book/[isbn].tsx](../apps/app/app/book/%5Bisbn%5D.tsx)

---

**Reviewer B:** `graphService.ts` — this is the newest code, let's be suspicious of it. Ran the actual live data through it rather than just reading.

```
$ curl .../api/graph/subject/historical_fiction | jq '.relatedConcepts'
[
  {"relation": "broader", "wikidataId": "Q1196408", "label": "historical fiction"},
  ...
```

**Reviewer A:** Wait. The center subject *is* "historical fiction" (Wikidata `Q136472`). And one of its own broader concepts is *also labeled* "historical fiction" — a completely different Wikidata item, `Q1196408`.

**Reviewer B:** Both slugify to the same node id: `subject:historical_fiction`. `dedupeNodes` correctly drops the duplicate node — but the *edge* pointing at it doesn't get cleaned up. It ends up pointing from the center back to itself.

**Reviewer A:** A self-loop, live, reproducible, not a hypothetical. Confirmed by diffing the edge count before and after a fix: 19 edges → 18 once it's filtered.

**Reviewer B:** While we're in here — is this the only way a node/edge mismatch could happen?

**Reviewer A:** No. If a future change ever adds an edge without adding both its endpoint nodes, `forceLink` on the client throws on the missing reference during layout — and since that runs inside a `useMemo` in render, it's an uncaught exception that white-screens the whole graph screen. No error boundary catches it.

**Reviewer B:** So: one shared cleanup pass, used by all three graph builders, that (a) dedupes nodes, (b) drops self-loops, (c) dedupes exact-duplicate edges, and (d) drops any edge whose endpoint didn't survive into the final node set.

```ts
function cleanGraph(nodes: GraphNode[], edges: GraphEdge[]) {
  const byId = new Map<string, GraphNode>();
  for (const node of nodes) if (!byId.has(node.id)) byId.set(node.id, node);

  const seen = new Set<string>();
  const dedupedEdges = edges.filter((e) => {
    if (e.source === e.target) return false;
    if (!byId.has(e.source) || !byId.has(e.target)) return false;
    const key = `${e.source}|${e.target}|${e.relation}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { nodes: [...byId.values()], edges: dedupedEdges };
}
```

**Reviewer A:** Verified across all three graph types after the fix — zero self-loops, zero dangling edges, consistently, including a repeat of the exact historical_fiction case that triggered this.

**Fixed** — [apps/server/src/services/graphService.ts](../apps/server/src/services/graphService.ts)

---

**Reviewer B:** Client side now. `app/graph/[type]/[id].tsx` and every other screen build navigation targets as raw template literals: `` router.push(`/subject/${slugifySubject(subject)}`) ``.

**Reviewer A:** Is that encoded anywhere?

**Reviewer B:** No. And subject slugs regularly contain characters that need encoding — we have a live example right in the data: `subject:british_and_irish_fiction_(fictional_works_by_one_author)`. Parens happen not to break routing, but nothing guarantees the next subject string won't contain a `#`, `&`, `?`, or `/`. Same problem on the Home screen's manual ISBN field — `keyboardType="number-pad"` is just a soft keyboard hint, it doesn't stop a web user (or a paste) from entering anything at all.

**Reviewer A:** Six files had this pattern independently: `index.tsx`, `scan.tsx`, `book/[isbn].tsx`, `author/[id].tsx`, `subject/[slug].tsx`, `work/[id].tsx`, plus the graph screen.

**Reviewer B:** Rather than sprinkle `encodeURIComponent()` at seven call sites — Expo Router's typed routes already support an object href form that encodes params itself and is fully type-checked against each screen's actual dynamic segment names:

```ts
export const routes = {
  book: (isbn: string): Href => ({ pathname: "/book/[isbn]", params: { isbn } }),
  author: (id: string): Href => ({ pathname: "/author/[id]", params: { id } }),
  subject: (slug: string): Href => ({ pathname: "/subject/[slug]", params: { slug } }),
  work: (id: string): Href => ({ pathname: "/work/[id]", params: { id } }),
  graph: (type: GraphNode["type"], id: string): Href => ({ pathname: "/graph/[type]/[id]", params: { type, id } }),
};
```

**Reviewer A:** That's better than manual encoding on two counts — it fixes the actual bug through the framework's own mechanism instead of reimplementing it, and it catches a typo'd route name or a param name mismatch at compile time. It also let us delete the manual `parseNodeId`-plus-`encodeURIComponent` cast dance in the graph screen.

**Reviewer B:** Every `router.push`/`router.replace` across the app now goes through `routes.*`. Typechecked clean, web bundle still compiles (1001 modules, no new errors).

**Fixed** — new [apps/app/src/navigation.ts](../apps/app/src/navigation.ts), applied across every screen

---

**Reviewer A:** `client.ts` — `getJson<T>()` does `return res.json()` typed as `Promise<T>`. That's a type *assertion*, not a check.

**Reviewer B:** And `packages/shared` has a full set of zod schemas for exactly these shapes — `BookSchema`, `AuthorSchema`, `GraphSchema`, all of it. None of them are actually being run against what comes back over the wire.

**Reviewer A:** So if the server ever sent something the client didn't expect — a bug in a route, a partial response during a bad deploy, a future schema drift between server and client — nothing would catch it. It'd either render wrong silently or throw somewhere deep in a component with a confusing stack trace.

**Reviewer B:** Changed `getJson` to take the schema and `.safeParse()` the response, throwing a clear `ApiError` naming the endpoint and the validation failure if it doesn't match:

```ts
async function getJson<T>(path: string, schema: ZodType<T>): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) { /* ...unchanged... */ }
  const result = schema.safeParse(await res.json());
  if (!result.success) {
    throw new ApiError(`Unexpected response shape from ${path}: ${result.error.message}`, res.status);
  }
  return result.data;
}
```

**Reviewer A:** This turns the existing "no book found" error UI into the same path a schema mismatch takes — no new UI needed, just an honest error instead of silent corruption.

**Fixed** — [apps/app/src/api/client.ts](../apps/app/src/api/client.ts)

---

**Reviewer B:** Last one, and this one we found by accident rather than by reading. Regression-testing everything above against the live server, `/api/graph/author/OL21594A` just... didn't come back. No error, no timeout, nothing in the log after "incoming request."

**Reviewer A:** How long did it actually take?

**Reviewer B:** Eventually resolved — successfully — after being left alone. But this pointed at something real: not one of our external calls, anywhere in the app, has a timeout. `fetch()` with no `signal` will wait forever if an upstream stalls instead of erroring cleanly.

**Reviewer A:** That's the worst version of "fails without being noticed" — it doesn't even fail, the user just gets an eternal spinner with no way to recover short of restarting the app.

**Reviewer B:** First pass: a shared `fetchWithTimeout()` using `signal: AbortSignal.timeout(ms)`, wired into all 8 external fetch call sites across `openLibrary.ts`, `googleBooks.ts`, and `wikidata.ts` (the SPARQL endpoint gets a longer 25s allowance — a live timed run of a real query took 8.4s, so 15s default would be too tight).

**Reviewer A:** Did that actually hold up under test?

**Reviewer B:** Partially. Regression-tested it against a live stall on `/api/graph/subject/historical_fiction` — Open Library's connection attempt stuck for over 15 minutes, but the configured timeout was 15 *seconds*. `AbortSignal.timeout()` alone wasn't sufficient; the abort didn't unstick the connection promptly.

**Reviewer A:** So harden it further — don't rely on `abort()` alone to free the caller, race it against an independent timer:

```ts
export function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Request to ${url} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  return Promise.race([fetch(url, { ...init, signal: controller.signal }), timeoutPromise])
    .finally(() => clearTimeout(timer));
}
```

**Reviewer B:** Worst case now: one abandoned socket in the background instead of a caller that never gets control back. Verified against a live ECONNRESET (375ms, clean 500) and a live slow-but-real SPARQL response (3.3s, clean 200) after the fix.

**Reviewer A:** One honest caveat, found during the same regression pass: a *separate* live stall later that same session took curl itself — independent of our code entirely — past its own `--max-time`. That pointed to a kernel-level TCP connection stall in the sandbox's network at that moment, below the layer any userspace timeout (ours or curl's) can interrupt. Worth being upfront about rather than claiming this closes every possible hang — it closes every hang within the application's control, which is what "no timeout at all" was missing. The server's own `/health` endpoint kept responding normally throughout, confirming a stalled external call doesn't take the rest of the server down with it.

**Fixed** — new [apps/server/src/httpClient.ts](../apps/server/src/httpClient.ts), applied to every external fetch in `apps/server/src/sources/`

---

**Reviewer B:** Last thing, a pure refactor, no bug attached. `routes/books.ts` still had its cache-and-fetch logic written inline, while `authors.ts`, `subjects.ts`, and `works.ts` had all been pulled out into `services/*.ts` during Phase 4 so the graph endpoint could reuse the same cached logic instead of duplicating it.

**Reviewer A:** So `books.ts` was the odd one out — inconsistent with the pattern everything else now follows, for no reason other than it predates the refactor.

**Reviewer B:** Pulled it into `services/bookService.ts` to match. No behavior change beyond picking up the `workId` fix above, which needed to live there anyway.

**Fixed** — new [apps/server/src/services/bookService.ts](../apps/server/src/services/bookService.ts), [apps/server/src/routes/books.ts](../apps/server/src/routes/books.ts) now a thin route wrapper like the other three

---

## Summary

| # | Finding | Kind | Where |
|---|---|---|---|
| 1 | Concurrent requests for the same uncached key each triggered their own upstream fetch | Efficiency | `cache.ts` |
| 2 | Untrusted Open Library data spliced unescaped into SPARQL queries | Security (injection) | `wikidata.ts` |
| 3 | One malformed author/work entry crashed an entire otherwise-good response | Robustness | `openLibrary.ts` |
| 4 | A failed author-name lookup silently displayed a raw id as a person's name | Silent failure | `openLibrary.ts` |
| 5 | `Book.openLibraryWorkId` was hardcoded `null` — real data available one hop away, and no graph entry point from a scanned book | Bug / feature gap | `openLibrary.ts`, `bookService.ts` |
| 6 | A Wikidata concept sharing its center subject's label produced a self-loop edge; no general guard against dangling edges | Bug (reproduced live) | `graphService.ts` |
| 7 | Route params built as unencoded template literals across 7 screens | Bug (latent, live example in data) | `navigation.ts` + all screens |
| 8 | zod schemas existed but nothing ever validated a response against them | Robustness gap | `client.ts` |
| 9 | No timeout on any external fetch — a stalled upstream hung the request indefinitely | Bug (reproduced live, twice) | `httpClient.ts` |
| 10 | `books.ts` inline logic inconsistent with the service-extraction pattern used everywhere else | Refactor | `bookService.ts` |

All ten fixes are typechecked clean in both workspaces, the web bundle compiles with no new errors, and every server endpoint was re-verified live after the changes.

## Deliberately not changed

- **`scan.tsx`'s unencoded `result.data`** — barcode types are restricted to `ean13`/`ean8`/`upc_a`/`upc_e`, which only ever decode to digit strings, so encoding is currently a no-op. `routes.book()` already handles it correctly if that restriction ever loosens; no separate fix needed.
- **Wikidata concept disambiguation remains heuristic** (reject-list on description keywords) — this is inherent to matching free-text subject strings against Wikidata, not a bug to "fix," and the code already degrades to "no match" rather than guessing wrong, which is the documented design intent from Phase 3.
