# Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the eight findings from the 2026-11-01 repo audit: slow Hardcover lookups, path searches failing during Wikidata cooldowns, Wikidata over-calling, an exposed listen address, and four small cleanups.

**Architecture:** All changes are in `apps/server`, plus one env example and one deploy doc. Each change is a few lines in existing files, following patterns already in use: `maxAttempts` (LoC), `optionalSource` (authorService), `Object.hasOwn` (suggest route), and the `body.query?.search` guard (wikidata.ts).

**Tech Stack:** Fastify, TypeScript, vitest.

**Spec:** The audit findings 1–8 in this session (the ponytail audit of 2026-11-01). There is no separate doc. Each task names the finding it fixes.

## Global Constraints

- No new dependencies, files or abstractions, apart from one new test file (`apps/server/src/sources/hardcover.test.ts`).
- Hardcover stays at `{ perSecond: 1, concurrent: 2 }`. Both Hardcover plans allow 60 requests a minute.
- Work on a branch, not `main`.
- Run commands from `apps/server`. The whole-suite check is `npx vitest run && npx tsc --noEmit`.

## Review Focus

1. Hardcover's answer for the 5th ISBN is a match: it must still be found (the cap is ≥5, not <5). Test: Task 1.
2. Wikidata fails, but Open Library has the author: the links still carry the author's name and the result isn't cached for 24 h. Test: Task 2 (cache length via a second call).
3. Wikidata answers HTTP 200 with `{ error: … }` for `searchAuthorQid` and `searchWorkQid` too, not only concept search. All three go through `wbSearchEntities`, and one test pins it there. Test: Task 3.
4. `GET /api/graph/__proto__/x` currently returns 500. It must return 400. Test: Task 4.
5. With `HOST` unset, the server must still listen on all interfaces, so local development against a phone on the LAN keeps working. Checked manually in Task 5.

---

### Task 1: Cap Hardcover ISBN attempts at 5 (finding 1)

**Files:**
- Modify: `apps/server/src/sources/hardcover.ts` (`lookupByAnyIsbn`, ~L141)
- Create: `apps/server/src/sources/hardcover.test.ts`

**Interfaces:**
- Consumes: `tryEachIsbn(isbns, lookup, { sourceName, isEmpty, fallback, maxAttempts })` from `../isbnFallback.js` (unchanged).
- Produces: `lookupByAnyIsbn(isbns: string[])`, same signature, which now stops after 5 ISBNs.

- [ ] **Step 1: Write the failing test**

Mock `../httpClient.js` so the per-host rate limit doesn't slow the test:

```ts
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "../httpClient.js";
import { lookupByAnyIsbn } from "./hardcover.js";

vi.mock("../httpClient.js", () => ({ fetchWithTimeout: vi.fn() }));
const noMatch = { ok: true, json: async () => ({ data: { editions: [] } }) } as unknown as Response;
const match = { ok: true, json: async () => ({ data: { editions: [{ book: { rating: 4, ratings_count: 10, user_books: [] } }] } }) } as unknown as Response;
const isbns = ["1", "2", "3", "4", "5", "6", "7", "8"];

beforeEach(() => {
  vi.stubEnv("HARDCOVER_API_KEY", "k");
  vi.mocked(fetchWithTimeout).mockReset();
});
afterEach(() => vi.unstubAllEnvs());

it("stops after 5 ISBNs when none match", async () => {
  vi.mocked(fetchWithTimeout).mockResolvedValue(noMatch);
  expect(await lookupByAnyIsbn(isbns)).toBeNull();
  expect(fetchWithTimeout).toHaveBeenCalledTimes(5);
});

it("still finds a match on the 5th ISBN", async () => {
  vi.mocked(fetchWithTimeout).mockResolvedValueOnce(noMatch).mockResolvedValueOnce(noMatch).mockResolvedValueOnce(noMatch).mockResolvedValueOnce(noMatch).mockResolvedValueOnce(match);
  expect((await lookupByAnyIsbn(isbns))?.rating).toBe(4);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/sources/hardcover.test.ts`
Expected: the first test FAILS with `expected "spy" to be called 5 times, but got 8 times`. The second passes.

- [ ] **Step 3: Implement.** Add `maxAttempts: 5` to the `tryEachIsbn` options in `lookupByAnyIsbn`. Add a one-line comment saying why: Hardcover allows 60 requests a minute, shared by every page.

- [ ] **Step 4: Run to verify it passes.** Same command. Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/sources/hardcover.ts src/sources/hardcover.test.ts
git commit -m "fix(server): try at most 5 ISBNs on Hardcover per work"
```

---

### Task 2: Path search keeps an author's links when Wikidata fails (finding 2)

**Files:**
- Modify: `apps/server/src/services/authorService.ts` (`getAuthorLinks`, L23-35, and the stale "SPARQL" comment at L8)
- Test: `apps/server/src/services/authorService.test.ts` (the `getAuthorLinks` describe)

**Interfaces:**
- Consumes: `optionalSource<T>(entry, sourceName, fallback)` from `./bookEnrichment.js` (already imported), and the `entry: CacheEntryOptions` argument that `TtlCache.wrap` passes to its fetcher.
- Produces: `getAuthorLinks(openLibraryId)`, same signature and shape. A Wikidata failure now gives `relations: []` / `pseudonyms: []` instead of a rejection.

- [ ] **Step 1: Write the failing tests** inside `describe("getAuthorLinks")`:

```ts
it("serves Open Library's name when every Wikidata call fails, and retries Wikidata next time", async () => {
  vi.mocked(openLibrary.getAuthor).mockResolvedValue({ name: "Ann", wikidataId: null, bio: null, birthDate: null, deathDate: null } as never);
  vi.mocked(wikidata.searchAuthorQid).mockReset().mockRejectedValue(new Error("Wikidata down"));
  expect(await getAuthorLinks("OL3A")).toEqual({ openLibraryId: "OL3A", name: "Ann", relations: [], pseudonyms: [] });

  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + 6 * 60_000); // past DEGRADED_TTL_MS (5 min)
  await getAuthorLinks("OL3A");
  vi.useRealTimers();
  expect(wikidata.searchAuthorQid).toHaveBeenCalledTimes(2);
});

it("serves empty relations when the relation lookups fail", async () => {
  vi.mocked(wikidata.fetchAuthorRelations).mockRejectedValue(new Error("Wikidata down"));
  vi.mocked(wikidata.fetchPseudonyms).mockRejectedValue(new Error("Wikidata down"));
  expect(await getAuthorLinks("OL4A")).toEqual({ openLibraryId: "OL4A", name: "Frank Herbert", relations: [], pseudonyms: [] });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/services/authorService.test.ts`
Expected: both new tests FAIL with `Wikidata down` (a rejection).

- [ ] **Step 3: Implement.** In `getAuthorLinks`, take `entry` in the `wrap` callback and add `.catch(optionalSource(entry, "<name>", <fallback>))` to `searchAuthorQid` (fallback `null`), `fetchAuthorRelations` (`[]`) and `fetchPseudonyms` (`[]`), exactly as `getAuthorDetail` does. Change the L8 comment from "its SPARQL endpoint is rate-limited" to "its API is rate-limited".

- [ ] **Step 4: Run to verify they pass.** Same command. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/authorService.ts src/services/authorService.test.ts
git commit -m "fix(server): path search keeps an author's links when Wikidata fails"
```

---

### Task 3: Wikidata search errors say what went wrong; one Qid check (findings 7, 5)

**Files:**
- Modify: `apps/server/src/sources/wikidata.ts` (`wbSearchEntities` ~L99-105; delete `isValidQid` L115-119; replace its uses with `isWikidataQid`)
- Modify: `apps/server/src/sources/wikipedia.ts:3,40` (import and use `isWikidataQid` from `../validation.js`)
- Test: `apps/server/src/sources/wikidata.test.ts`

**Interfaces:**
- Consumes: `isWikidataQid(id: string): boolean` from `apps/server/src/validation.ts` (it already exists, has tests, and uses the same regex).
- Produces: `isValidQid` is removed. Nothing outside these files imports it, as a grep confirms.

- [ ] **Step 1: Write the failing test** in `wikidata.test.ts`. Also delete the `describe("isValidQid")` block and its import, because `validation.test.ts` covers the same cases.

```ts
describe("wbSearchEntities error bodies", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("an HTTP 200 error body rejects with Wikidata's own message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ error: { info: "maxlag exceeded" } }) })));
    await expect(searchConceptQid("Ghosts")).rejects.toThrow("Wikidata search error: maxlag exceeded");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/sources/wikidata.test.ts`
Expected: FAIL, because it rejects with `TypeError: Cannot read properties of undefined (reading 'find')`.

- [ ] **Step 3: Implement.** In `wbSearchEntities`, after `res.json()`, throw `new Error(\`Wikidata search error: ${body.error?.info ?? "no results list"}\`)` when `!Array.isArray(body.search)`. Add `error?: { info?: string }` to `WbSearchResult`. Then remove `isValidQid` and import `isWikidataQid` from `../validation.js` in `wikidata.ts` and `wikipedia.ts`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/sources src/validation.test.ts && npx tsc --noEmit`
Expected: all pass and no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/sources/wikidata.ts src/sources/wikidata.test.ts src/sources/wikipedia.ts
git commit -m "fix(server): clear Wikidata search errors; one Wikidata id check"
```

---

### Task 4: Graph route rejects inherited names as a type (finding 6)

**Files:**
- Modify: `apps/server/src/routes/graph.ts:19-21` (`isGraphType`)
- Test: `apps/server/src/routes/graph.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("returns 400 for inherited object names used as a graph type", async () => {
  const app = Fastify();
  await app.register(graphRoutes);
  for (const type of ["constructor", "toString", "__proto__", "valueOf"]) {
    const res = await app.inject({ method: "GET", url: `/api/graph/${type}/x` });
    expect(res.statusCode, type).toBe(400);
  }
  await app.close();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/routes/graph.test.ts`
Expected: FAIL with `constructor: expected 200 to be 400`.

- [ ] **Step 3: Implement.** `isGraphType` returns `Object.hasOwn(BUILDERS, value)`.

- [ ] **Step 4: Run to verify it passes.** Same command. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/graph.ts src/routes/graph.test.ts
git commit -m "fix(server): graph route rejects inherited names as a type"
```

---

### Task 5: Wikidata pacing, dead host entry, listen address (findings 3, 8, 4)

These are config-only changes, so no new test (see the ruling below). The check is the full suite plus a manual start.

**Files:**
- Modify: `apps/server/src/httpClient.ts:19-20` (`HOST_LIMITS`)
- Modify: `apps/server/src/index.ts:86` (`app.listen`)
- Modify: `apps/server/.env.example` (add `HOST` next to `PORT`/`TRUST_PROXY`)
- Modify: `docs/deploy-social-cards.md` ("Rate limiting" section)

- [ ] **Step 1: Implement**
  - In `httpClient.ts`, change `"www.wikidata.org"` to `{ perSecond: 2, concurrent: 1 }`, with the comment `// Wikimedia asks API clients to send requests one at a time.` Delete the `"query.wikidata.org"` line.
  - In `index.ts`, change the listen call to `app.listen({ port, host: process.env.HOST ?? "0.0.0.0" })`.
  - In `.env.example`, add the `HOST=` comment: `Address to listen on. Leave unset (all interfaces) for local development; set to 127.0.0.1 when a reverse proxy on the same machine is the only caller.`
  - In the deploy doc's "Rate limiting" section, add one sentence: set `HOST=127.0.0.1` on the Droplet, so the API can't be reached on port 3001 even without the firewall.

- [ ] **Step 2: Verify**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all test files pass and there are no type errors. `src/sources/wikidata.test.ts` uses the real per-host pacing, so it slows from about 6 s to about 14 s. Its slowest test (4 calls) takes about 2 s, which is under vitest's 5 s timeout. A timeout there means the pacing change is wrong, so don't raise the timeout.

Run: `HOST=127.0.0.1 PORT=3999 npx tsx src/index.ts`, then stop it with Ctrl-C after it logs.
Expected: only `Server listening at http://127.0.0.1:3999`.

Run the same command without `HOST=`.
Expected: several `listening at` lines, including the LAN address (Review Focus 5).

- [ ] **Step 3: Commit**

```bash
git add src/httpClient.ts src/index.ts .env.example ../../docs/deploy-social-cards.md
git commit -m "fix(server): pace Wikidata one request at a time; HOST env for the listen address"
```

Ruling for the executor's ledger: Task 5 has no failing-test step. It changes two config values and one env default. A test would only restate the constants, and the behavior that matters (fewer Wikidata 429 errors) shows up in production logs, not in tests.

---

## After deploying (for the user)

On the Droplet:
1. Add `HOST=127.0.0.1` to `apps/server/.env`.
2. Run `pm2 restart server`.
3. Confirm that `pm2 logs` shows only `listening at http://127.0.0.1:3001`.
4. Over the next day, check that the `www.wikidata.org is cooling down` lines become rare.
