# Open Library Account and Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users sign in to their own Open Library account. ShelfThread can then read their Open Library lists, import them, create new lists on Open Library from local lists, and keep linked lists in sync.

**Architecture:** Open Library has no OAuth. Its documented login (`POST /account/login`) exchanges an archive.org S3 key pair for a `session` cookie. The server stores the keys and the cookie, both sealed with the existing `secretBox`, in a new `ol_sessions` table in the existing account store. It gives the app an opaque ShelfThread session token, sent back as `X-OpenLibrary-Session`. When a write fails because the cookie has expired, the server logs in again with the stored keys and retries once. App-side, a list gains an optional `openLibraryListId`, and each member an optional `openLibrarySeed`. The design mirrors the Hardcover link: changes are pushed right away, and a "Sync with Open Library" button pulls changes made there. A list can be linked to Hardcover and Open Library at the same time.

**Tech Stack:** Fastify 5, `node:sqlite`, `node:crypto` (through `secretBox.ts`), vitest; Expo Router app, `expo-secure-store`, React Query, zod (`@book-explorer/shared`).

**Spec:** [docs/11_12_26_to-dos.txt](../../11_12_26_to-dos.txt):
1. Add an Open Library authentication option (https://openlibrary.org/dev/docs/restful_api), similar to the Hardcover login.
2. Use https://openlibrary.org/dev/docs/api/lists so a user can create a list and add it to Open Library, pull up their existing lists through their account, and send lists to their account.

Decisions the user made in this session:
- **Sign-in:** archive.org S3 keys (access + secret), not email and password.
- **After a push:** the lists stay linked, with live sync like Hardcover. The docs list seed endpoints for adding and removing seeds even though "update list" isn't implemented; Task 0 confirms they work.
- **"create an account in the app"** in item 2 means "the app reads their lists using their Open Library account". It does not mean ShelfThread signup.

## Global Constraints

- No new dependencies on either the server or the app.
- Login: `POST https://openlibrary.org/account/login` with `Content-Type: application/json` and body `{"access": "...", "secret": "..."}`. Success is HTTP 200 with `Set-Cookie: session=...`. Task 0 confirms the exact path, the status codes and the cookie format, and every later task uses Task 0's findings where they differ from this.
- Every Open Library request sends the existing `User-Agent` (`USER_AGENT` from `sources/openLibrary.ts`).
- The S3 keys and session cookie never leave the server and are always `seal`ed at rest. The app sees only the ShelfThread session token. Never log a request body on these routes.
- Server feature switch: `openLibraryEnabled()` is true when `HARDCOVER_TOKEN_KEY` is set and `accountStoreOpen()`. **No new env vars.** The key keeps its Hardcover name, because renaming it would break production; `.env.example` gets a note that it also seals Open Library keys. When the switch is off, every `/api/openlibrary/*` route returns 503 `{ error: "Open Library sign-in isn't set up on this server." }`.
- Session header: `X-OpenLibrary-Session`. The app stores the token under SecureStore/AsyncStorage key `openlibrary-session`.
- Session lifetime: 90 days from sign-in, the same constant as Hardcover sessions.
- Id formats, validated at the server boundary: list id `/^OL\d+L$/`, seed `/^\/(works\/OL\d+W|books\/OL\d+M|authors\/OL\d+A)$/`, S3 key `/^[A-Za-z0-9]{8,64}$/` (Task 0 confirms the real length).
- Member to seed: `work` → `/works/<id>`, `author` → `/authors/<id>`, and `book` (an ISBN) → the edition key from `GET /isbn/<isbn>.json` (`key`, for example `/books/OL7353617M`), or "missing" when Open Library returns 404.
- Seed to member: `/works/X` → `{ type: "work", id: X }`, `/authors/X` → `{ type: "author", id: X }`, `/books/X` → `{ type: "book", id: <isbn_13[0] ?? isbn_10[0]> }` from `GET /books/X.json`, and anything else (subjects, or an edition with no ISBN) → `null`.
- **Open Library lists are public.** Before the first copy of any local list, ask: title "Make this list public?", message "Open Library lists are public. Anyone can see this list's name, description and books.", confirm button "Copy to Open Library". Use `confirmDestructive`.
- Copy: user-facing names are "Open Library" and "My Open Library Account". Error text: rejected keys → "Open Library didn't accept those keys. Check both and try again."; lost session → "Connect your Open Library account again."; 429 → "Open Library is busy. Try again in a minute."
- Match the house style: route files stay thin and services own the logic; comments state the why in one line; every new module ships with its `*.test.ts`. Mark known limits with `// shortcut: <limit>, <when to upgrade>`.

## Review Focus

1. **The session cookie expires during normal use.** The next write gets a 401/403. The server logs in again with the stored keys, saves the new cookie and retries once, and the user notices nothing. (Test in Task 3.)
2. **The user regenerates their S3 keys on archive.org.** The re-login fails, so the server deletes the session and returns 401. The app clears its token and shows the sign-in form instead of an error loop. (Tests in Tasks 3 and 4.)
3. **An ISBN Open Library doesn't have.** The add reports "missing" by title and carries on, and the local list keeps the book. (Tests in Tasks 2 and 6.)
4. **An Open Library list holding subjects, ISBN-less editions, or the wrong kind for the local list** (authors in a book list, books in an author list). Import and sync skip those seeds, name them, and never delete or crash. (Tests in Tasks 5 and 7.)
5. **Open Library returns fewer seeds than `seed_count`** (paging cut short or a timeout). Sync refuses to drop any member and says so. (Test in Task 7.)

---

### Task 0: Confirm API behaviour with a real account (spike, no code shipped)

Open Library's docs leave seven points unsettled. **Stop and ask the owner** to put their S3 keys in their shell as `OL_ACCESS` and `OL_SECRET`. The keys never go into a file or a commit. Run every request with `curl -A "BookExplorer/0.1"`.

**Files:**
- Create: `docs/superpowers/notes/2026-11-12-open-library-api-shapes.md`, recording each request and response with the keys and cookies removed.

- [ ] **Step 1: Login.** POST the JSON body to `/account/login`, and separately to `/account/login.json`. Record which one works, the status code, the `Set-Cookie` line (with the value removed), and the cookie's `Expires`/`Max-Age` if it has one. Send wrong keys once and record the status and body. Record the length and character set of real S3 keys.
- [ ] **Step 2: Username.** Record whether the cookie value starts with `/people/<username>` or `/user/<username>`. If neither, find an endpoint that returns the signed-in user, and record it.
- [ ] **Step 3: Create a list.** `POST /people/<u>/lists` (also try `/lists.json` if the first fails) with `{"name":"ShelfThread spike","description":"","seeds":[]}`. Record the status, and where the new list id appears: the `Location` header or a `key` in the body.
- [ ] **Step 4: Add and remove seeds.** Try `POST /people/<u>/lists/<id>/seeds.json` and the `/list/` spelling the docs also use, with `{"add":[{"key":"/works/OL45804W"},{"key":"/books/OL7353617M"},{"key":"/authors/OL23919A"}]}`. Then remove one with `{"remove":["/works/OL45804W"]}`, and if that fails, with `{"remove":[{"key":"/works/OL45804W"}]}`. Record which URL and body shapes work, and whether one call can carry 50 adds.
- [ ] **Step 5: Reading.** `GET /people/<u>/lists.json` and `GET /people/<u>/lists/<id>/seeds.json`. Record whether each seed entry includes `title`, and what the paging looks like (the `links.next` format, the default limit, and whether `?limit=1000` is honoured).
- [ ] **Step 6: Expired cookie.** Send a seed write with the cookie value changed. Record the status (401, 403, or a 302 to `/account/login`) and the body.
- [ ] **Step 7: Rate limit.** Send 60 cheap reads in a minute. Record whether a 429 appears, and its `Retry-After` header.
- [ ] **Step 8: Clean up.** `POST /people/<u>/lists/<id>/delete.json`. Confirm the spike list is gone.
- [ ] **Step 9: Commit**

```bash
git add docs/superpowers/notes/2026-11-12-open-library-api-shapes.md
git commit -m "docs: record Open Library auth and lists API shapes"
```

---

### Task 1: Server: Open Library sessions and login

**Files:**
- Modify: `apps/server/src/accountStore.ts` (new table and functions)
- Create: `apps/server/src/sources/openLibraryUser.ts`
- Test: `apps/server/src/accountStore.test.ts`, `apps/server/src/sources/openLibraryUser.test.ts`

**Interfaces:**
- Produces (`accountStore.ts`; `ol_sessions(token_hash PK, username, access_key, secret_key, cookie, created_at)`, created in `openAccountStore`. Every secret is `seal`ed, and callers pass and get plaintext):
  - `interface OpenLibrarySession { username: string; accessKey: string; secretKey: string; cookie: string }`
  - `createOlSession(sessionToken: string, s: OpenLibrarySession): void`, `getOlSession(sessionToken: string): OpenLibrarySession | null`, `updateOlCookie(sessionToken: string, cookie: string): void`, `deleteOlSession(sessionToken: string): void`. All are keyed by `sha256(sessionToken)` and share the 90-day `SESSION_TTL_MS`. A row that can't be unsealed is deleted and returns null, as `getSession` does.
- Produces (`openLibraryUser.ts`):
  - `class OpenLibraryAuthError extends Error`: thrown on the login-rejected and cookie-rejected responses that Task 0 recorded
  - `class OpenLibraryRateLimitError extends Error { retryAfterSeconds: number }`: from `Retry-After`, defaulting to 60
  - `login(accessKey: string, secretKey: string): Promise<{ cookie: string; username: string }>`: `cookie` is the full `session=...` pair to send back, and `username` comes from Task 0 step 2

- [ ] **Step 1: Write the failing tests** (mock `fetchWithTimeout` the way `hardcover.test.ts` does; `openAccountStore(":memory:")`)

```ts
// accountStore.test.ts
it("never stores Open Library keys or cookies in plaintext", ...); // raw ol_sessions row contains none of "AKEY", "SKEY", "session=abc"
it("updateOlCookie replaces only the cookie", ...);
it("getOlSession on an unknown token → null", ...);
// openLibraryUser.test.ts
it("login posts the keys as JSON with the User-Agent and returns cookie and username", async () => {
  vi.mocked(fetchWithTimeout).mockResolvedValue(new Response("{}", { status: 200, headers: { "Set-Cookie": 'session="/people/ada%2C2026-11-12%2Cabc"; Path=/' } }));
  expect(await login("AKEY", "SKEY")).toEqual({ cookie: 'session="/people/ada%2C2026-11-12%2Cabc"', username: "ada" });
  const [, init] = vi.mocked(fetchWithTimeout).mock.calls[0];
  expect(JSON.parse(init!.body as string)).toEqual({ access: "AKEY", secret: "SKEY" });
});
it("login throws OpenLibraryAuthError on rejected keys", ...);   // response shape per Task 0 step 1
it("maps 429 to OpenLibraryRateLimitError with Retry-After", ...);
```

- [ ] **Step 2: Run them and confirm they fail.** `npm test -w apps/server -- accountStore openLibraryUser`. Expected: FAIL.
- [ ] **Step 3: Implement** the interfaces above. Put one private `olFetch(path: string, init: RequestInit & { cookie?: string }): Promise<Response>` in `openLibraryUser.ts` that adds the User-Agent and cookie and maps the error statuses. Task 2 reuses it.
- [ ] **Step 4: Run them and confirm they pass.** Same command. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(server): Open Library login and sealed session storage`

---

### Task 2: Server: Open Library list calls and seed mapping

**Files:**
- Modify: `apps/server/src/sources/openLibraryUser.ts`, `packages/shared/src/index.ts`
- Test: `apps/server/src/sources/openLibraryUser.test.ts`

**Interfaces:**
- Consumes: `olFetch`, `OpenLibraryAuthError` (Task 1); `TtlCache` (`cache.ts`)
- Produces (`shared`, with inferred types exported):
  - `OpenLibraryMemberSchema = z.object({ type: z.enum(["book", "work", "author"]), id: z.string() })`
  - `OpenLibraryListSummarySchema = z.object({ id: z.string(), name: z.string(), seedCount: z.number().int() })`
  - `OpenLibraryListSchema = z.object({ name: z.string(), description: z.string(), seedCount: z.number().int(), seeds: z.array(z.object({ seed: z.string(), title: z.string(), member: OpenLibraryMemberSchema.nullable() })) })`
  - `OpenLibraryAddResultSchema = z.object({ added: z.array(OpenLibraryMemberSchema.extend({ seed: z.string() })), missing: z.array(OpenLibraryMemberSchema) })`
- Produces (`openLibraryUser.ts`):
  - `seedFor(member: OpenLibraryMember): Promise<string | null>`: follows the Global Constraints mapping. ISBN lookups are cached 7 days, misses included.
  - `memberFor(seed: string): Promise<OpenLibraryMember | null>`: the reverse mapping. Edition lookups are cached 7 days.
  - `myLists(username: string): Promise<OpenLibraryListSummary[]>`: `id` is the trailing `OL…L` of each entry's `url`.
  - `getList(username: string, listId: string): Promise<OpenLibraryList | null>`: the list's `.json` plus every seeds page up to 2,000 seeds, with `memberFor` run on at most 4 seeds at a time. Mark the cap: `// shortcut: stops at 2,000 seeds; sync's seedCount guard refuses to prune past it. Page further if real lists get that big`.
  - `createList(username: string, input: { name: string; description: string }, cookie: string): Promise<string>`: returns the new list id.
  - `updateSeeds(username: string, listId: string, change: { add: string[]; remove: string[] }, cookie: string): Promise<void>`: URL and body shapes per Task 0 step 4.
  - Reads send no cookie (lists are public), and writes always do.

- [ ] **Step 1: Write the failing tests**

```ts
it("seedFor maps works and authors without a request", async () => {
  expect(await seedFor({ type: "work", id: "OL45804W" })).toBe("/works/OL45804W");
  expect(await seedFor({ type: "author", id: "OL23919A" })).toBe("/authors/OL23919A");
  expect(fetchWithTimeout).not.toHaveBeenCalled();
});
it("seedFor resolves an ISBN to its edition key and caches it", ...);   // 2 calls → 1 fetch
it("seedFor returns null for an ISBN Open Library doesn't have", ...);  // 404
it("memberFor maps an edition to its ISBN-13, else ISBN-10", ...);
it("memberFor returns null for subjects and ISBN-less editions", ...);
it("getList follows links.next until every seed is read", ...);
it("updateSeeds sends the cookie and the add/remove body", ...);
it("updateSeeds throws OpenLibraryAuthError on an expired cookie", ...); // status per Task 0 step 6
```

- [ ] **Step 2: Run them and confirm they fail.** `npm test -w apps/server -- openLibraryUser`. Expected: FAIL.
- [ ] **Step 3: Implement** the schemas and functions above.
- [ ] **Step 4: Run them and confirm they pass.** Expected: PASS.
- [ ] **Step 5: Commit**: `feat(server): Open Library list reads, writes and seed mapping`

---

### Task 3: Server: account service, routes and wiring

**Files:**
- Create: `apps/server/src/services/openLibraryAccount.ts`, `apps/server/src/routes/openLibrary.ts`
- Modify: `apps/server/src/index.ts` (register `openLibraryRoutes` after `hardcoverRoutes`), `apps/server/.env.example` (a note on `HARDCOVER_TOKEN_KEY`), `docs/CODEBASE.md` (one row per new file; update the `accountStore.ts` row)
- Test: `apps/server/src/services/openLibraryAccount.test.ts`, `apps/server/src/routes/openLibrary.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; `randomToken` (`secretBox.ts`); `upstreamErrorHandler`
- Produces (`openLibraryAccount.ts`):
  - `openLibraryEnabled(): boolean` (Global Constraints)
  - `class OpenLibrarySignedOutError extends Error`
  - `connect(accessKey: string, secretKey: string): Promise<{ token: string; username: string }>`: `login`, then `createOlSession` under a `randomToken()`. A rejected login rethrows `OpenLibraryAuthError` and stores nothing.
  - `asUser<T>(sessionToken: unknown, run: (s: { username: string; cookie: string }) => Promise<T>): Promise<T>`: throws `OpenLibrarySignedOutError` for a missing or unknown session. When `run` throws `OpenLibraryAuthError`, it logs in again with the stored keys, calls `updateOlCookie`, and runs once more. If that re-login is rejected, it deletes the session and throws `OpenLibrarySignedOutError`.
  - `getOpenLibraryAccount(sessionToken: unknown): { username: string } | null`, `disconnectOpenLibrary(sessionToken: unknown): void` (deletes the row; Open Library has no revoke)
- Produces (HTTP; every route returns 503 when `!openLibraryEnabled()`, and the session comes from `x-openlibrary-session`):
  - `POST /api/openlibrary/session` with `{ access, secret }` → `200 { token, username }` | `400 { error: "Enter both keys." }` when either fails the key regex | `401 { error: "Open Library didn't accept those keys. Check both and try again." }`
  - `GET /api/openlibrary/session` → `{ username }` | 401. `DELETE /api/openlibrary/session` → 204.
  - `GET /api/openlibrary/lists` → `OpenLibraryListSummary[]`
  - `GET /api/openlibrary/lists/:listId` → `OpenLibraryList` | 404 | 400 for a malformed id
  - `POST /api/openlibrary/lists` with `{ name, description }` → `{ id }`, with the same 100/1000-character validation and copy as `POST /api/hardcover/lists`
  - `POST /api/openlibrary/lists/:listId/seeds` with `{ members: OpenLibraryMember[] }` (1–100 members, each with a valid type and a non-empty id) → `OpenLibraryAddResult`. It runs `seedFor` on each member; nulls go to `missing`. It then makes **one** `updateSeeds` call with every non-null seed, skipped when there are none.
  - `DELETE /api/openlibrary/lists/:listId/seeds?seed=<seed>` → 204 | 400 when the seed fails the regex
  - A plugin-scoped `setErrorHandler`: `OpenLibraryRateLimitError` → 429 with `Retry-After` and `{ error, retryAfterSeconds }`; `OpenLibrarySignedOutError` → `401 { error: "Connect your Open Library account again." }`; everything else goes to `upstreamErrorHandler`.
  - Every read and write route goes through `asUser`, and reads use `s.username`.

- [ ] **Step 1: Write the failing tests** (the service mocks `../sources/openLibraryUser.js` and opens the store at `:memory:`; the routes use `Fastify().register(openLibraryRoutes)` and `inject` with the service mocked)

```ts
// openLibraryAccount.test.ts
it("connect stores nothing when Open Library rejects the keys", ...);
it("asUser logs in again once on an expired cookie and keeps the new cookie", async () => {
  // run rejects with OpenLibraryAuthError the first time, resolves "ok" the second; login → { cookie: "session=new", username: "ada" }
  expect(await asUser(token, run)).toBe("ok");
  expect(login).toHaveBeenCalledTimes(1);
  expect(getOlSession(token)?.cookie).toBe("session=new");
});
it("asUser deletes the session when the stored keys stop working", async () => {
  await expect(asUser(token, run)).rejects.toBeInstanceOf(OpenLibrarySignedOutError);
  expect(getOlSession(token)).toBeNull();
});
it("asUser with no session throws OpenLibrarySignedOutError without calling run", ...);
// openLibrary.test.ts
it("503 on every route when the feature is off", ...);
it("POST session 400s on a malformed key and 401s on rejected keys", ...);
it("adding members makes one updateSeeds call and reports misses", async () => {
  // seedFor: work → "/works/OL1W", book "9780000000002" → null
  const res = await app.inject({ method: "POST", url: "/api/openlibrary/lists/OL9L/seeds", headers, payload: { members: [{ type: "work", id: "OL1W" }, { type: "book", id: "9780000000002" }] } });
  expect(res.json()).toEqual({ added: [{ type: "work", id: "OL1W", seed: "/works/OL1W" }], missing: [{ type: "book", id: "9780000000002" }] });
  expect(updateSeeds).toHaveBeenCalledTimes(1);
});
it("rejects a malformed list id or seed with 400", ...);
it("maps a signed-out error to 401 and a rate limit to 429 with Retry-After", ...);
```

- [ ] **Step 2: Run them and confirm they fail.** `npm test -w apps/server -- openLibraryAccount routes/openLibrary`. Expected: FAIL.
- [ ] **Step 3: Implement** the service, routes, wiring and docs. Mark the re-login: `// shortcut: two requests on an expired cookie may both log in; harmless because cookies don't rotate. Add a single-flight map like hardcoverAccount's if Open Library starts limiting logins`.
- [ ] **Step 4: Run the server suite and typecheck.** `npm test -w apps/server && npm run typecheck -w apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(server): Open Library account and list routes`

---

### Task 4: App: sign-in and the "My Open Library Account" screen

**Files:**
- Create: `apps/app/src/sessionStore.ts`, `apps/app/src/openLibrarySession.ts`, `apps/app/app/openlibrary.tsx`
- Modify: `apps/app/src/hardcoverSession.ts` (now built on `sessionStore.ts`; its exports keep their names), `apps/app/app/_layout.tsx` (load both sessions before the first query, and drop `["openlibrary"]` queries when that session is cleared, as is done for Hardcover), `apps/app/src/api/client.ts`, `apps/app/src/navigation.ts` (`routes.openLibrary()`), `apps/app/app/settings.tsx` (a "My Open Library Account" row next to the Hardcover one), `packages/shared/src/index.ts`
- Test: `apps/app/src/sessionStore.test.ts` (replaces `hardcoverSession.test.ts`; move its cases over)

**Interfaces:**
- Produces (`sessionStore.ts`): `createSessionStore(key: string): { load(): Promise<void>; get(): string | null; save(token: string): Promise<void>; clear(): Promise<void>; onCleared(listener: () => void): () => void }`. The body is the current `hardcoverSession.ts`, parameterised by key, with the web shortcut comment carried over.
- Produces (`openLibrarySession.ts`): `loadOpenLibrarySession`, `getOpenLibrarySessionToken`, `saveOpenLibrarySession`, `clearOpenLibrarySession`, `onOpenLibrarySessionCleared`, all from `createSessionStore("openlibrary-session")`.
- Produces (`shared`): `OpenLibraryAccountSchema = z.object({ username: z.string() })`, `OpenLibrarySessionSchema = OpenLibraryAccountSchema.extend({ token: z.string() })`.
- Produces (`client.ts`): every request sends `X-OpenLibrary-Session` when a token exists. A 401 from any `/api/openlibrary/` path calls `clearOpenLibrarySession()` before throwing. New functions:
  - `connectOpenLibrary(access: string, secret: string): Promise<{ token: string; username: string }>`, `fetchOpenLibraryAccount()`, `disconnectOpenLibrary()`
  - `fetchOpenLibraryLists()`, `fetchOpenLibraryList(id: string)`, `createOpenLibraryList(input: { name: string; description: string }): Promise<{ id: string }>`
  - `addOpenLibraryMembers(listId: string, members: OpenLibraryMember[]): Promise<OpenLibraryAddResult>`, `removeOpenLibrarySeed(listId: string, seed: string): Promise<void>`
- `openlibrary.tsx` uses React Query key `["openlibrary", "account"]` and has four states, following `hardcover.tsx`:
  - Loading.
  - Unavailable (503): "Open Library sign-in isn't available on this server."
  - Signed out: one line, "Sign in with your archive.org S3 keys to import your Open Library lists and send lists to your account.", then a link "Get your keys at archive.org" (`https://archive.org/account/s3.php`, opened with `expo-web-browser`), then two `secureTextEntry` fields labelled "Access key" and "Secret key" with autocorrect and autocapitalize off, then a "Sign in" button. The keys are kept only in component state and cleared after any result.
  - Connected: "Signed in as @username" and a "Sign out" button, which uses `confirmDestructive` and then `clearOpenLibrarySession`. It also shows one line: "To revoke ShelfThread's access, generate new keys at archive.org." Leave space for Task 7's import section.

- [ ] **Step 1: Write the failing tests**

```ts
// sessionStore.test.ts (mock expo-secure-store, AsyncStorage and Platform as hardcoverSession.test.ts does)
it("save → get → clear round-trips in memory and storage", ...);
it("two stores with different keys don't share a token", async () => {
  const a = createSessionStore("a"); const b = createSessionStore("b");
  await a.save("t1");
  expect(b.get()).toBeNull();
});
it("clear calls the registered listener", ...);
```

- [ ] **Step 2: Run them and confirm they fail.** `npm test -w apps/app -- sessionStore`. Expected: FAIL.
- [ ] **Step 3: Implement** the store, the client changes, the screen, the route and the settings row. Copy the UI patterns from `hardcover.tsx`.
- [ ] **Step 4: Run the app suite and typecheck.** `npm test -w apps/app && npm run typecheck -w apps/app`. Expected: PASS.
- [ ] **Step 5: Manual check.** With the server running locally, sign in with real keys, then sign out. Enter one wrong key and confirm the rejection message. Change the stored cookie in the DB by hand and confirm a list read still works, because the server logged in again.
- [ ] **Step 6: Commit**: `feat(app): My Open Library Account with S3-key sign-in`

---

### Task 5: App storage: Open Library links and reconcile

**Files:**
- Modify: `apps/app/src/storage/savedLists.ts`, `apps/app/src/storage/mergeSnapshot.ts`, `packages/shared/src/index.ts` (`SavedListExportSchema`, near line 394)
- Create: `apps/app/src/storage/openLibraryReconcile.ts`
- Test: `apps/app/src/storage/savedLists.test.ts`, `apps/app/src/storage/mergeSnapshot.test.ts`, `apps/app/src/storage/openLibraryReconcile.test.ts`, `apps/app/src/storage/snapshot.test.ts`

**Interfaces:**
- Produces (`savedLists.ts`):
  - `SavedList.openLibraryListId?: string`, `ListMember.openLibrarySeed?: string`, and `openLibrarySeed?: string` on `removedMembers` entries, carried by `updateList` the same way `hardcoverBookId` is
  - `createList(input: { …existing; openLibraryListId?: string })`
  - `linkOpenLibraryList(id: string, openLibraryListId: string | null): Promise<void>`: null removes the key
  - `setMemberOpenLibrarySeed(listId: string, type: ListMember["type"], id: string, seed: string): Promise<void>`
  - `settleRemovals(listId: string, service: "hardcover" | "openLibrary" = "hardcover")`: clears only that service's id from `removedMembers`, so finishing one sync can't drop the other service's pending deletes
- Produces (export schema): `openLibraryListId: z.string().regex(/^OL\d+L$/).optional()` on the list, and `openLibrarySeed: z.string().optional()` on members and removed members.
- Produces (`mergeSnapshot.ts`): `openLibrarySeed` falls back to the losing copy's value exactly as `hardcoverBookId` does, and so does a removed member's seed. As with Hardcover, `openLibraryListId` does not fall back.
- Produces (`openLibraryReconcile.ts`): `reconcileOpenLibrary(local: ListMember[], remote: OpenLibraryList["seeds"], kind: SavedList["kind"], now: number): ListMember[]`, a pure function:
  1. Keep a local member with no `openLibrarySeed`.
  2. Keep a local member whose seed is in `remote`.
  3. Drop a local member whose seed isn't in `remote`.
  4. Append each remote seed with a non-null `member` that is the right kind for the list (`author` for author lists, `book` or `work` for book lists), whose seed no local member carries, and whose `type:id` isn't already local: `{ ...member, title, openLibrarySeed: seed, addedAt: now }`.
  5. Keep the local order and append new members in remote order.

No `SCHEMA_VERSION` bump: every new field is optional.

- [ ] **Step 1: Write the failing tests**

```ts
it("keeps unpushed local members", ...);
it("drops members removed on Open Library", ...);
it("adds Open Library-only works and books with their seed", ...);
it("skips null members and members of the wrong kind", () => {
  const remote = [{ seed: "/authors/OL1A", title: "Ada", member: { type: "author", id: "OL1A" } }, { seed: "/books/OL2M", title: "No ISBN", member: null }];
  expect(reconcileOpenLibrary([], remote, "book", 1)).toEqual([]);
});
it("never duplicates a local member that matches a remote seed by type and id", ...);
// savedLists.test.ts
it("settleRemovals('openLibrary') keeps pending Hardcover deletes", ...);
// mergeSnapshot.test.ts
it("a member keeps the losing copy's openLibrarySeed", ...);
// snapshot.test.ts
it("export → import keeps openLibraryListId and openLibrarySeed", ...);
```

- [ ] **Step 2: Run them and confirm they fail.** `npm test -w apps/app -- savedLists mergeSnapshot openLibraryReconcile snapshot`. Expected: FAIL.
- [ ] **Step 3: Implement** the fields, setters, schema, merge and `reconcileOpenLibrary`.
- [ ] **Step 4: Run the app suite.** Expected: PASS.
- [ ] **Step 5: Commit**: `feat(app): lists can link to Open Library lists`

---

### Task 6: App: push adds and removes to linked Open Library lists

**Files:**
- Create: `apps/app/src/openLibraryLists.ts`
- Modify: `apps/app/src/storage/listMembership.ts` (`applyListChanges`), and every caller of `applyListChanges` (find them with `grep -rn applyListChanges apps/app`)
- Test: `apps/app/src/openLibraryLists.test.ts`, `apps/app/src/storage/listMembership.test.ts`

**Interfaces:**
- Consumes: Task 4 client functions, Task 5 storage
- Produces (`openLibraryLists.ts`):
  - `pushOpenLibraryAdd(list: SavedList, member: ListMember): Promise<"pushed" | "missing" | "skipped">`: returns `skipped` when the list isn't linked. Otherwise it calls `addOpenLibraryMembers` with a single member and `setMemberOpenLibrarySeed` for that member, returning `missing` when the result lists it as missing. Errors are thrown.
  - `pushOpenLibraryRemove(list: SavedList, member: ListMember): Promise<void>`: a no-op unless the list is linked and the member has a seed, or while another member still carries the same seed (the same guard as `pushRemove`).
- `applyListChanges`: rename the last parameter from `onHardcoverIssue` to `onSyncIssue` and update its callers. After each Hardcover push, run the Open Library push in its own `try`. The local write always stands. Report one of these:
  - `"Saved here, but Open Library doesn't have this edition."` (for `missing`)
  - `"Saved here. Open Library didn't update; use Sync with Open Library on the list to retry."` (an add error)
  - `"Removed here. Open Library didn't update, so it may come back on the next sync."` (a remove error)

- [ ] **Step 1: Write the failing tests** (mock `../api/client`)

```ts
it("pushOpenLibraryAdd stores the returned seed", ...);
it("pushOpenLibraryAdd skips an unlinked list without calling the API", ...);
it("pushOpenLibraryAdd returns 'missing' when the server can't map the ISBN", ...);
it("pushOpenLibraryRemove does nothing for a member that was never pushed", ...);
// listMembership.test.ts
it("a list linked to both services pushes to both, and one failing doesn't stop the other", ...);
it("a failed Open Library push keeps the local add and reports the retry message", ...);
```

- [ ] **Step 2: Run them and confirm they fail.** `npm test -w apps/app -- openLibraryLists listMembership`. Expected: FAIL.
- [ ] **Step 3: Implement** the two push functions and the `applyListChanges` changes.
- [ ] **Step 4: Run the app suite and typecheck.** Expected: PASS.
- [ ] **Step 5: Commit**: `feat(app): push list changes to linked Open Library lists`

---

### Task 7: App: import, copy and sync with Open Library

**Files:**
- Create: `apps/app/src/listSync.ts` (helpers moved out of `hardcoverLists.ts`)
- Modify: `apps/app/src/hardcoverLists.ts` (use the moved helpers; behaviour unchanged), `apps/app/src/openLibraryLists.ts`, `apps/app/app/openlibrary.tsx`, `apps/app/app/lists/[id].tsx`
- Test: `apps/app/src/openLibraryLists.test.ts`, `apps/app/src/hardcoverLists.test.ts` (must still pass unchanged)

**Interfaces:**
- Produces (`listSync.ts`, moved from `hardcoverLists.ts` with their bodies unchanged):
  - `retryRateLimited<T>(run: () => Promise<T>, sleep: (ms: number) => Promise<void>, onWait: (seconds: number) => void): Promise<T>`: the 429 loop from `copyToHardcover`, keeping `MAX_RATE_LIMIT_RETRIES`
  - `applyPulledMembers(latest: SavedList, next: ListMember[]): Promise<void>`: `replaceMembers`, then the saved-book repair and the notes-preserving unsave loop that currently ends `syncWithHardcover`
- Produces (`openLibraryLists.ts`):
  - `importOpenLibraryList(openLibraryListId: string): Promise<{ list: SavedList; skipped: string[] }>`: the kind is `author` when every non-null member is an author, and `book` otherwise. The name is trimmed to 100 characters, falling back to "Open Library list". Members come from `reconcileOpenLibrary([], seeds, kind, now)`, and `skipped` holds the titles of seeds that didn't land.
  - `copyToOpenLibrary(list: SavedList, onProgress: (done: number, total: number) => void, sleep = wait, onWait = () => {}): Promise<{ missing: string[] }>`: if the list isn't linked, strip stale seeds (as `copyToHardcover` strips stale ids), `createOpenLibraryList`, and `linkOpenLibraryList`. Then send the members that have no seed **in batches of 50** through `addOpenLibraryMembers`, each batch wrapped in `retryRateLimited`, setting each returned seed. Resuming after an interruption pushes only the members still without a seed.
  - `syncWithOpenLibrary(list: SavedList): Promise<{ missing: string[]; skipped: string[] }>`: copy (the push half), re-read the list, finish pending removals (`removedMembers` with a seed not re-added), fetch the remote list, and throw `"Open Library sent only part of this list, so nothing was removed. Try again later."` when `seeds.length < seedCount`. Otherwise `applyPulledMembers(latest, reconcileOpenLibrary(...))`, then `settleRemovals(list.id, "openLibrary")`.
- `openlibrary.tsx` (connected state) gains an "Import a list from Open Library" section. Rows read "name · N items", each with an Import button; a list already linked shows "Imported" with a link to the local list. After an import, route to the new list and show the skipped titles.
- `lists/[id].tsx`, for book and author lists when `getOpenLibrarySessionToken()` is set:
  - Unlinked: a "Copy to Open Library" button. Its first press runs the public-list confirmation from Global Constraints.
  - Linked: "Sync with Open Library", plus an "Unlink" button confirmed with "Unlink from Open Library?" / "This list stops syncing. Nothing changes on Open Library.".
  - Generalise the existing `runHardcover` helper and the copy modal to take the service name, so the two services share one busy flag, one summary line ("Open Library doesn't have: A, B." / "Open Library is up to date.") and one progress modal titled "Copying to Open Library".
  - When the user is signed in to both services, both button groups show.

- [ ] **Step 1: Write the failing tests**

```ts
it("copyToOpenLibrary sends members in batches of 50", async () => {
  await copyToOpenLibrary(listOf(120), () => {});
  expect(vi.mocked(addOpenLibraryMembers).mock.calls.map((c) => c[1].length)).toEqual([50, 50, 20]);
});
it("copyToOpenLibrary waits Retry-After on 429 and retries the same batch", ...);
it("copyToOpenLibrary resumes: members with seeds are not re-sent", ...);
it("importOpenLibraryList makes an author list from an all-author list", ...);
it("importOpenLibraryList reports subjects and ISBN-less editions by title", ...);
it("syncWithOpenLibrary refuses to prune when fewer seeds than seedCount arrive", async () => {
  vi.mocked(fetchOpenLibraryList).mockResolvedValue({ name: "L", description: "", seedCount: 3, seeds: [seed1] });
  await expect(syncWithOpenLibrary(linkedList)).rejects.toThrow("Open Library sent only part of this list");
  expect(replaceMembers).not.toHaveBeenCalledWith(linkedList.id, expect.anything());
});
it("syncWithOpenLibrary finishes a pending remote delete instead of re-adding it", ...);
```

- [ ] **Step 2: Run them and confirm they fail.** `npm test -w apps/app -- openLibraryLists hardcoverLists`. Expected: the new tests FAIL and the Hardcover tests PASS.
- [ ] **Step 3: Implement** the moved helpers, the three functions and the UI.
- [ ] **Step 4: Run the app suite and typecheck.** `npm test -w apps/app && npm run typecheck -w apps/app`. Expected: PASS.
- [ ] **Step 5: Manual check** with a real account:
  - Import an existing Open Library list.
  - Add a book here and confirm it appears on openlibrary.org.
  - Remove a work on openlibrary.org, press Sync, and confirm it's gone here.
  - Copy a three-book local list, accept the public warning, and confirm the list appears on Open Library.
  - Copy an author list and confirm its authors appear.
- [ ] **Step 6: Commit**: `feat(app): import, copy and sync lists with Open Library`

---

### Task 8: Production smoke test (the owner does this; the executor stops and asks)

No env changes are needed, because the feature runs on `HARDCOVER_TOKEN_KEY` and `ACCOUNT_DB_PATH`, which are already set on the droplet.

- [ ] **Step 1: Ask the owner to deploy**, then run `curl -s https://api.shelfthread.com/api/openlibrary/session` with the production `X-App-Key`. Expect a 401, not a 503; a 503 means the account store didn't open.
- [ ] **Step 2: Ask the owner to sign in** on https://shelfthread.com and in a native build, import one list, and copy one list. Confirm both on openlibrary.org.
