# Hardcover Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each ShelfThread user connects their own Hardcover account through OAuth. Their Hardcover lookups then run on their own token, and they can create, import, migrate and sync book lists with Hardcover and see their reading progress on book and work pages.

**Architecture:** The server is a confidential OAuth client (Hardcover's "Web app (server-side)" type; PKCE plus client secret). It keeps each user's Hardcover tokens encrypted in a new SQLite file (`node:sqlite`, as `cache.ts` already uses) and gives the app only an opaque ShelfThread session token, sent back as `X-Hardcover-Session`. Every Hardcover call stays on the server. The app holds the session token in SecureStore on native and in AsyncStorage on web. Local lists gain an optional `hardcoverListId`. Changes to a linked list are pushed right away, and a "Sync with Hardcover" button pulls changes made on Hardcover.

**Tech Stack:** Fastify 5, `node:sqlite`, `node:crypto` (AES-256-GCM, SHA-256), vitest; Expo Router app, `expo-web-browser`, `expo-secure-store`, React Query, zod (`@book-explorer/shared`).

**Spec:** the user's request in this session (no separate spec file):
1. Replace the shared personal API key with Hardcover OAuth (https://docs.hardcover.app/api/oauth/getting-started-server/).
2. Add a "My Hardcover Account" feature.
3. My Hardcover Account must let users (a) use Hardcover features on their own account, (b) create lists in Hardcover from ShelfThread, (c) add other entities, such as favorite authors, *if Hardcover supports it, otherwise skip*, (d) import lists from Hardcover, (e) migrate ShelfThread lists to Hardcover, and (f) see reading progress from Hardcover.

Decisions the user made in this session:
- **Signed-out users:** Hardcover lookups use the user's token when signed in, and otherwise fall back to the server's `HARDCOVER_API_KEY`.
- **List sync:** ShelfThread pushes adds and removes on linked lists right away, and a manual "Sync with Hardcover" pulls Hardcover's changes. There is no background sync.
- **3c:** Build "follow author" only if Task 0 shows the API supports it.

## Global Constraints

- Node `>=22.13`. No new server dependencies: use `node:sqlite` and `node:crypto` only.
- New app dependencies: `expo-web-browser` and `expo-secure-store`, installed with `npx expo install` so the versions match the Expo SDK. Nothing else.
- Hardcover endpoints (hardcode these; skip discovery): authorize `https://hardcover.app/oauth2/authorize`, token `https://api.hardcover.app/oauth2/token`, revoke `https://api.hardcover.app/oauth2/revoke`, GraphQL `https://api.hardcover.app/v1/graphql`, issuer `https://api.hardcover.app`.
- PKCE is required: `code_challenge_method=S256`, a verifier of 32 random bytes in base64url, challenge = base64url(SHA-256(verifier)). `state` is 24 random bytes in base64url.
- The callback must check that `state` matches a pending flow (single use) **and** that `iss === "https://api.hardcover.app"` before it uses `code`.
- Token requests send `application/x-www-form-urlencoded` with HTTP Basic auth `client_id:client_secret`.
- Requested scopes, as one constant: `read:me:content read:catalog read:lists write:lists read:library`. Add `write:social` only if Task 0 proves that following an author works.
- Refresh tokens **rotate on every use, and a reused refresh token revokes the whole chain**. Run at most one refresh per session at a time, and persist the new tokens before using them.
- Access tokens last 1 week. Refresh when fewer than 5 minutes remain.
- Hardcover access and refresh tokens never leave the server. The app sees only the ShelfThread session token.
- New server env vars, all required for the feature: `MY_HARDCOVER_CLIENT_ID`, `MY_HARDCOVER_CLIENT_SECRET`, `HARDCOVER_REDIRECT_URI`, `HARDCOVER_TOKEN_KEY` (32 bytes, base64, made with `openssl rand -base64 32`), `ACCOUNT_DB_PATH`. Optional: `HARDCOVER_RETURN_URLS`, comma-separated allowed return-URL prefixes, defaulting to `bookexplorer://,<PUBLIC_WEB_URL or DEFAULT_WEB_ORIGIN>/`. With any required var missing, every `/api/hardcover/*` route returns 503 `{ error: "Hardcover sign-in isn't set up on this server." }`.
- Session header: `X-Hardcover-Session`.
- New Hardcover lists are created private (`privacy_setting_id: 3`).
- Hardcover lists hold books only. Author lists can't be linked, imported or migrated, and author members are skipped with a message.
- Hardcover reading statuses: `1 want`, `2 reading`, `3 read`, `4 paused`, `5 dnf`, `6 ignored` (shown as no status).
- Hardcover's rate limit is 60 requests a minute **per user**. Pass a Hardcover 429 to the app as 429 with `retryAfterSeconds`.
- Match the house style: route files stay thin, services own the logic, comments explain the why in a line, and each new module ships with its `*.test.ts`.

## Review Focus

1. **Two requests refresh the same session at once:** this must make one refresh call, and both requests must get the new token. A second refresh would reuse the old refresh token and Hardcover would revoke the whole chain. (Test in Task 3.)
2. **The user revokes ShelfThread on Hardcover's Authorized Apps page:** the next call gets a 401 from Hardcover, the server deletes the session, and the app shows "Connect Hardcover" again instead of an error loop. (Tests in Tasks 3 and 7.)
3. **The user denies consent or closes the browser:** the callback gets `error=access_denied`, so redirect back with `?error=denied` and have the app show "Hardcover wasn't connected." A closed native browser returns `cancelled` and shows nothing. (Tests in Tasks 3 and 6.)
4. **A book Hardcover doesn't have, or a work with no ISBN:** an add or migrate skips that book, says so by title, and carries on. The local list keeps it. (Tests in Tasks 7 and 10.)
5. **A 429 in the middle of a migration:** wait `retryAfterSeconds` and resume at the same member, without aborting or duplicating. (Test in Task 10.)

---

### Task 0: Confirm API shapes with a real token (spike, no code shipped)

The docs contradict themselves or say nothing on four points. Settle them before you write any GraphQL. Use the owner's PAT from `apps/server/.env`.

**Files:**
- Create: `docs/superpowers/notes/2026-11-01-hardcover-api-shapes.md` (the findings: the queries you ran and the responses you got back, with tokens removed)

- [ ] **Step 1: `me` shape.** Run `{ me { id username } }`. Record whether `me` is an array (Hasura style) or an object. Every later `me` query in this plan assumes **an array, read `[0]`**. If it's an object, note that every task must drop the `[0]`.
- [ ] **Step 2: `insert_list` return shape.** Create a private list named `ShelfThread spike` with `insert_list(object: {name, description, privacy_setting_id: 3}) { id }`. If that's rejected, try `{ affected_rows returning { id } }`. Record which works.
- [ ] **Step 3: `insert_list_book` position.** Add any book without `position`. Record whether it's accepted and where the book lands. If `position` is required, later tasks pass `books_count + 1`.
- [ ] **Step 4: Error shapes.** Send one request with a bad token and record its HTTP status and body. Send 61 cheap requests in a minute and record the 429's status, `Retry-After` header and body.
- [ ] **Step 5: Author follow (3c).** Introspect with `{ __type(name: "follows") { fields { name } } }` and `{ __schema { mutationType { fields(includeDeprecated: false) { name args { name type { name kind ofType { name } } } } } } }`, filtered to `insert_follow`. If `insert_follow` takes a followable type and id, and following an author works, record the exact mutation. Otherwise write "not supported: skip Task 12".
- [ ] **Step 6: Clean up.** Delete the spike list with `delete_list(id)`.
- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/notes/2026-11-01-hardcover-api-shapes.md
git commit -m "docs: record Hardcover API shapes for the OAuth integration"
```

---

### Task 1: Encrypted account store

**Files:**
- Create: `apps/server/src/secretBox.ts`, `apps/server/src/accountStore.ts`
- Test: `apps/server/src/secretBox.test.ts`, `apps/server/src/accountStore.test.ts`

**Interfaces:**
- Produces (`secretBox.ts`):
  - `randomToken(bytes = 32): string` (base64url)
  - `sha256(value: string): string` (hex)
  - `seal(plain: string): string`: AES-256-GCM with the key from `HARDCOVER_TOKEN_KEY`, output `base64url(iv).base64url(tag).base64url(ciphertext)`, 12-byte IV
  - `open(sealed: string): string`: throws on tampering or the wrong key
- Produces (`accountStore.ts`; every token is `seal`ed at rest, and callers pass and get plaintext):
  - `interface HardcoverTokens { accessToken: string; refreshToken: string; expiresAt: number }`
  - `interface StoredSession extends HardcoverTokens { hardcoverUserId: number; username: string }`
  - `openAccountStore(path: string): void`, `closeAccountStore(): void`, `accountStoreOpen(): boolean`
  - `savePending(state: string, value: { verifier: string; returnTo: string }): void`
  - `takePending(state: string): { verifier: string; returnTo: string } | null`: deletes the row, returns null when it's older than 10 minutes
  - `saveHandoff(code: string, sessionToken: string): void`, `takeHandoff(code: string): string | null`: single use, 2-minute TTL, stored by `sha256(code)`, the session token sealed
  - `createSession(sessionToken: string, session: StoredSession): void`, `getSession(sessionToken: string): StoredSession | null`, `updateTokens(sessionToken: string, tokens: HardcoverTokens): void`, `deleteSession(sessionToken: string): void`, all keyed by `sha256(sessionToken)`

Tables: `oauth_pending(state PK, verifier, return_to, created_at)`, `handoffs(code_hash PK, session_token, expires_at)`, `sessions(token_hash PK, hardcover_user_id, username, access_token, refresh_token, access_expires_at, created_at)`. Load `node:sqlite` the same way `cache.ts:31` does.

- [ ] **Step 1: Write the failing tests**

```ts
// secretBox.test.ts (vi.stubEnv("HARDCOVER_TOKEN_KEY", Buffer.alloc(32, 7).toString("base64")))
it("round-trips", () => expect(open(seal("hc_at_x"))).toBe("hc_at_x"));
it("uses a fresh IV per call", () => expect(seal("a")).not.toBe(seal("a")));
it("rejects a tampered ciphertext", () => { const s = seal("a"); expect(() => open(s.slice(0, -2) + "AA")).toThrow(); });
it("rejects a key that isn't 32 bytes", () => { vi.stubEnv("HARDCOVER_TOKEN_KEY", "c2hvcnQ="); expect(() => seal("a")).toThrow(/32 bytes/); });

// accountStore.test.ts (openAccountStore(":memory:") in beforeEach, closeAccountStore() in afterEach)
it("takePending is single-use", ...);              // second take → null
it("takePending expires after 10 minutes", ...);   // vi.setSystemTime
it("takeHandoff is single-use and expires after 2 minutes", ...);
it("never stores tokens in plaintext", ...);       // read the sessions row raw: it doesn't contain "hc_at_x"
it("updateTokens replaces both tokens and expiry", ...);
it("getSession on an unknown token → null", ...);
```

- [ ] **Step 2: Run them and confirm they fail.** `npm test -w apps/server -- secretBox accountStore`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement both modules** with the interfaces above.
- [ ] **Step 4: Run them and confirm they pass.** Same command. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/server/src/secretBox.ts apps/server/src/secretBox.test.ts apps/server/src/accountStore.ts apps/server/src/accountStore.test.ts
git commit -m "feat(server): encrypted SQLite store for Hardcover sessions"
```

---

### Task 2: Hardcover OAuth client

**Files:**
- Create: `apps/server/src/sources/hardcoverOAuth.ts`
- Test: `apps/server/src/sources/hardcoverOAuth.test.ts`

**Interfaces:**
- Consumes: `randomToken`, `HardcoverTokens` (Task 1), `fetchWithTimeout` (`httpClient.ts`)
- Produces:
  - `HARDCOVER_ISSUER = "https://api.hardcover.app"`, `HARDCOVER_SCOPES` (Global Constraints)
  - `class HardcoverAuthRevokedError extends Error`: thrown when the token endpoint answers 400 `invalid_grant` or 401
  - `newPkce(): { verifier: string; challenge: string }`
  - `authorizeUrl(params: { state: string; challenge: string }): string`: query string `response_type=code, client_id, redirect_uri, state, code_challenge, code_challenge_method=S256, scope`
  - `exchangeCode(code: string, verifier: string): Promise<HardcoverTokens>`: `grant_type=authorization_code, code, redirect_uri, code_verifier`
  - `refreshTokens(refreshToken: string): Promise<HardcoverTokens>`: `grant_type=refresh_token, refresh_token`, with no `scope`, so Hardcover keeps the same scopes
  - `revokeToken(token: string): Promise<void>`: best effort, and never throws
  - `fetchMe(accessToken: string): Promise<{ id: number; username: string }>`: `{ me { id username } }`, shape per Task 0 step 1

`expiresAt = Date.now() + expires_in * 1000`.

- [ ] **Step 1: Write the failing tests** (mock `fetchWithTimeout` the way `hardcover.test.ts:5` does)

```ts
it("challenge is base64url SHA-256 of the verifier", () => {
  const { verifier, challenge } = newPkce();
  expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
});
it("authorizeUrl carries every required param", () => {
  const u = new URL(authorizeUrl({ state: "s", challenge: "c" }));
  expect(u.origin + u.pathname).toBe("https://hardcover.app/oauth2/authorize");
  expect(Object.fromEntries(u.searchParams)).toMatchObject({ response_type: "code", client_id: "cid", redirect_uri: "https://api.example/api/hardcover/callback", state: "s", code_challenge: "c", code_challenge_method: "S256", scope: HARDCOVER_SCOPES });
});
it("exchangeCode posts a form with Basic auth and returns expiresAt", ...); // Authorization === "Basic " + base64("cid:secret"); body has code_verifier
it("refreshTokens throws HardcoverAuthRevokedError on invalid_grant", ...);
it("revokeToken swallows network errors", ...);
```

- [ ] **Step 2: Run them and confirm they fail.** `npm test -w apps/server -- hardcoverOAuth`. Expected: FAIL.
- [ ] **Step 3: Implement** with the interfaces above. Read `MY_HARDCOVER_CLIENT_ID`, `MY_HARDCOVER_CLIENT_SECRET` and `HARDCOVER_REDIRECT_URI` from `process.env` at call time, so `vi.stubEnv` works.
- [ ] **Step 4: Run them and confirm they pass.** Expected: PASS.
- [ ] **Step 5: Commit**: `feat(server): Hardcover OAuth client with PKCE`

---

### Task 3: Account service (connect, callback, handoff, token refresh)

**Files:**
- Create: `apps/server/src/services/hardcoverAccount.ts`
- Test: `apps/server/src/services/hardcoverAccount.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2
- Produces:
  - `accountEnabled(): boolean`: all five required env vars are set and `accountStoreOpen()`
  - `class InvalidReturnUrlError extends Error`, `class ExpiredCallbackError extends Error`
  - `startConnect(returnTo: string): string`: rejects a `returnTo` that doesn't start with an allowed prefix (`HARDCOVER_RETURN_URLS`, see Global Constraints), then saves the pending flow and returns the authorize URL
  - `completeConnect(query: { code?: string; state?: string; iss?: string; error?: string }): Promise<string>`: takes the pending flow by `state`, throwing `ExpiredCallbackError` when there's none. On `iss` mismatch or a missing `code`, returns `${returnTo}?error=failed`. When `error` is present, returns `${returnTo}?error=denied`. Otherwise it exchanges the code, calls `fetchMe`, creates a session under a `randomToken()` and returns `${returnTo}?handoff=<code>`. Join with `&` when `returnTo` already has a `?`.
  - `redeemHandoff(code: string): { token: string; username: string } | null`
  - `userAuthorization(sessionToken: unknown): Promise<string | null>`: returns `"Bearer <access token>"`. It refreshes when fewer than 5 minutes are left. It returns null for a missing, non-string or unknown session, and on `HardcoverAuthRevokedError` it deletes the session and returns null.
  - `forgetSession(sessionToken: string): void`: for a Hardcover 401 seen later (Task 7)
  - `getAccount(sessionToken: unknown): { username: string } | null`
  - `disconnect(sessionToken: unknown): Promise<void>`: `revokeToken(refreshToken)`, then `deleteSession`

Run refreshes one at a time with a module-level `Map<string, Promise<string>>` keyed by session token, deleted in `finally`. Mark the limit: `// shortcut: in-process lock, assumes one server process; move to a DB lease if this ever runs as several instances`.

- [ ] **Step 1: Write the failing tests** (mock `../sources/hardcoverOAuth.js`; `openAccountStore(":memory:")`)

```ts
it("startConnect rejects a return URL outside the allowlist", () => expect(() => startConnect("https://evil.example/x")).toThrow(InvalidReturnUrlError));
it("completeConnect with an unknown state throws ExpiredCallbackError", ...);
it("completeConnect rejects the wrong issuer without exchanging the code", async () => {
  const url = startConnect("bookexplorer://hardcover-connected");
  const state = new URL(url).searchParams.get("state")!;
  expect(await completeConnect({ code: "c", state, iss: "https://evil.example" })).toBe("bookexplorer://hardcover-connected?error=failed");
  expect(exchangeCode).not.toHaveBeenCalled();
});
it("completeConnect maps error=access_denied to ?error=denied", ...);
it("full flow: handoff redeems once to a session that authorizes", async () => { /* ... */ expect(await userAuthorization(token)).toBe("Bearer hc_at_1"); expect(redeemHandoff(code)).toBeNull(); });
it("two concurrent calls on an expiring session refresh once", async () => {
  // session expiresAt = now + 60s; refreshTokens resolves after a tick with hc_at_2/hc_rt_2
  const [a, b] = await Promise.all([userAuthorization(token), userAuthorization(token)]);
  expect(a).toBe("Bearer hc_at_2"); expect(b).toBe("Bearer hc_at_2");
  expect(refreshTokens).toHaveBeenCalledTimes(1);
  expect(getSession(token)?.refreshToken).toBe("hc_rt_2");
});
it("a revoked refresh token deletes the session and returns null", ...);
it("disconnect revokes and deletes", ...);
```

- [ ] **Step 2: Run them and confirm they fail.** `npm test -w apps/server -- hardcoverAccount`. Expected: FAIL.
- [ ] **Step 3: Implement** with the interfaces above.
- [ ] **Step 4: Run them and confirm they pass.** Expected: PASS.
- [ ] **Step 5: Commit**: `feat(server): Hardcover account sessions with single-flight refresh`

---

### Task 4: Account routes, server wiring, env docs

**Files:**
- Create: `apps/server/src/routes/hardcover.ts`
- Modify: `apps/server/src/index.ts` (register routes; `openAccountStore(process.env.ACCOUNT_DB_PATH)` when set; cors `methods: ["GET", "HEAD", "POST", "DELETE"]`), `apps/server/src/appAuth.ts` (`isPublicPath`: also `/api/hardcover/callback`), `apps/server/.env.example`, `.gitignore` (add `*.db`, so `accounts.db` is never committed), `docs/CODEBASE.md` (one table row per new server file)
- Test: `apps/server/src/routes/hardcover.test.ts`, `apps/server/src/appAuth.test.ts`

**Interfaces:**
- Consumes: Task 3
- Produces (HTTP; every route returns 503 when `!accountEnabled()`):
  - `POST /api/hardcover/connect` with body `{ returnTo: string }` → `200 { authorizeUrl }` | `400` (bad returnTo)
  - `GET /api/hardcover/callback` → `302` to the URL from `completeConnect` | `400` text/plain `This sign-in link has expired. Go back to ShelfThread and try connecting again.`
  - `POST /api/hardcover/session` with body `{ handoff: string }` → `200 { token, username }` | `400 { error: "That sign-in has expired. Try connecting again." }`
  - `GET /api/hardcover/session` → `200 { username }` | `401`
  - `DELETE /api/hardcover/session` → `204`
  - `requireUser(request, reply): Promise<string | null>`, exported for Task 7. It returns the Bearer header, or sends `401 { error: "Connect your Hardcover account again." }` and returns null.

The callback is a public path because Hardcover redirects the browser there without `X-App-Key`. `connect` returns the URL rather than redirecting, so the app's key check still covers starting a flow.

- [ ] **Step 1: Write the failing tests** (`Fastify().register(hardcoverRoutes)` + `inject`, as in `search.test.ts`; mock `../services/hardcoverAccount.js`)

```ts
it("503 on every route when the feature is off", ...);       // accountEnabled → false
it("connect 400s on a disallowed returnTo", ...);
it("callback 302s to the service's URL", ...);               // location header equals it
it("callback 400s with the expiry text on ExpiredCallbackError", ...);
it("GET session 401s without a valid header", ...);
// appAuth.test.ts
it("treats the OAuth callback as public", () => expect(isPublicPath("/api/hardcover/callback?code=x")).toBe(true));
```

- [ ] **Step 2: Run them and confirm they fail.** `npm test -w apps/server -- routes/hardcover appAuth`. Expected: FAIL.
- [ ] **Step 3: Implement** the routes and the wiring. Document every new env var in `.env.example` in the existing comment style, including where to register the app (Hardcover → API → Developer Apps, type "Web app (server-side)", redirect `https://<api host>/api/hardcover/callback`; for local dev `http://localhost:3001/api/hardcover/callback`, plus `exp://` in `HARDCOVER_RETURN_URLS` for Expo Go). Note that Device Authorization Grant should stay **off**.
- [ ] **Step 4: Run them and confirm they pass.** Then run `npm test -w apps/server && npm run typecheck -w apps/server`. Expected: all PASS.
- [ ] **Step 5: Commit**: `feat(server): Hardcover connect/callback/session routes`

---

### Task 5: Book and work lookups run on the user's token

**Files:**
- Modify: `apps/server/src/sources/hardcover.ts`, `apps/server/src/services/bookEnrichment.ts:43`, `apps/server/src/services/bookService.ts`, `apps/server/src/services/workService.ts:43`, `apps/server/src/routes/books.ts`, `apps/server/src/routes/works.ts`
- Test: `apps/server/src/sources/hardcover.test.ts`, `apps/server/src/routes/books.test.ts` (create)

**Interfaces:**
- Consumes: `userAuthorization` (Task 3)
- Produces:
  - `hardcoverGraphql<T>(query: string, variables: object, authorization: string): Promise<T>`, exported from `hardcover.ts`. It throws `HardcoverRateLimitError` (`retryAfterSeconds: number`, from `Retry-After`, default 60) on 429, `HardcoverUnauthorizedError` on 401, and `Error` on GraphQL `errors`, using the shapes from Task 0 step 4. `lookupByIsbn` moves onto it.
  - `lookupByIsbn(isbn: string, authorization?: string | null)` and `lookupByAnyIsbn(isbns: string[], authorization?: string | null)`: `authorization ?? authHeader()`, where `authHeader()` is the existing server-key fallback
  - `startCommonEnrichment(isbnCandidates, workId, entry, hardcoverAuth?: string | null)`
  - `getBookDetail(isbn: string, hardcoverAuth?: string | null)`, `getWorkDetail(workId: string, hardcoverAuth?: string | null)`
- The routes pass `await userAuthorization(request.headers["x-hardcover-session"])`. Graph, path and OG callers pass nothing and keep the server key.

Add a one-line comment at the cache wrap: the cached result is public catalog data, so it's shared across users whichever token fetched it.

- [ ] **Step 1: Write the failing tests**

```ts
it("uses the caller's token over the server key", async () => {
  vi.stubEnv("HARDCOVER_API_KEY", "server");
  vi.mocked(fetchWithTimeout).mockResolvedValue(match);
  await lookupByIsbn("1", "Bearer user");
  expect(vi.mocked(fetchWithTimeout).mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer user" });
});
it("falls back to the server key when signed out", ...);
it("skips Hardcover when neither is set", ...);               // returns null, no fetch
it("hardcoverGraphql maps 429 to HardcoverRateLimitError with Retry-After", ...);
// books.test.ts
it("passes the session's authorization into getBookDetail", ...); // mock both services
```

- [ ] **Step 2: Run them and confirm they fail.** `npm test -w apps/server -- hardcover books`. Expected: FAIL.
- [ ] **Step 3: Implement** the parameter threading. In `.env.example`, change the `HARDCOVER_API_KEY` comment to say it is now the fallback for signed-out visitors only.
- [ ] **Step 4: Run the whole server suite** with `npm test -w apps/server && npm run typecheck -w apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(server): Hardcover lookups use the signed-in user's token`

---

### Task 6: App: connect flow and the "My Hardcover Account" screen

**Files:**
- Install: `cd apps/app && npx expo install expo-web-browser expo-secure-store`
- Create: `apps/app/src/hardcoverSession.ts`, `apps/app/src/hardcoverConnect.ts`, `apps/app/app/hardcover.tsx`, `apps/app/app/hardcover-connected.tsx`
- Modify: `apps/app/src/api/client.ts` (headers, `sendJson`, account API functions), `apps/app/app/_layout.tsx` (`await loadSession()` before the first query, the same way other startup loads run there), `apps/app/src/navigation.ts` (`routes.hardcover()`), `apps/app/app/settings.tsx` (a "My Hardcover Account" row linking to it), `packages/shared/src/index.ts`
- Test: `apps/app/src/hardcoverConnect.test.ts`, `apps/app/src/hardcoverSession.test.ts`

**Interfaces:**
- Produces (`shared`): `HardcoverAccountSchema = z.object({ username: z.string() })`, `HardcoverHandoffSchema = HardcoverAccountSchema.extend({ token: z.string() })`
- Produces (`hardcoverSession.ts`): `loadSession(): Promise<void>`, `getSessionToken(): string | null` (synchronous, from memory), `saveSession(token: string): Promise<void>`, `clearSession(): Promise<void>`. Native uses SecureStore key `hardcover-session`. Web uses AsyncStorage, marked `// shortcut: web keeps the session token in localStorage (XSS-readable); it's our revocable session id, not the Hardcover token. Move to an httpOnly cookie if the web app ever loads third-party scripts`.
- Produces (`client.ts`): every request sends `X-Hardcover-Session` when a token exists. Add `sendJson<T>(method: "POST" | "DELETE", path: string, body: unknown, schema?: ZodType<T>): Promise<T | undefined>`, with the same error mapping as `getJson`. A 401 from any `/api/hardcover/` path calls `clearSession()` before it throws. Also add `startHardcoverConnect(returnTo: string): Promise<string>`, `redeemHardcoverHandoff(handoff: string): Promise<{ token: string; username: string }>`, `fetchHardcoverAccount(): Promise<{ username: string }>` and `disconnectHardcover(): Promise<void>`.
- Produces (`hardcoverConnect.ts`): `parseConnectReturn(url: string): { handoff: string } | { error: "denied" | "failed" } | null`, plus `connectHardcover(): Promise<"connected" | "cancelled" | "redirected">`. Native: `returnUrl = Linking.createURL("hardcover-connected")` → `WebBrowser.openAuthSessionAsync(authorizeUrl, returnUrl)`. A non-`success` result returns `cancelled`. A success parses the URL, redeems the handoff and saves the session; an `error` result throws `Error("Hardcover wasn't connected.")`. Web: `window.location.assign(authorizeUrl)` and return `redirected`, after which the `/hardcover-connected` screen finishes the flow.
- `hardcover-connected.tsx` reads `handoff` or `error` from `useLocalSearchParams`, redeems the handoff, then `router.replace(routes.hardcover())`. On error it shows the message and a "Back to My Hardcover Account" button.
- `hardcover.tsx` uses React Query key `["hardcover", "account"]` and has four states:
  - Loading.
  - Unavailable (503): "Hardcover sign-in isn't available on this server."
  - Signed out: a "Connect Hardcover" button and one line: "Use your own Hardcover account for ratings and reviews, sync lists, and see your reading progress."
  - Connected: "Connected as @username" and a "Disconnect" button, which uses `confirmDestructive` then `clearSession`. Leave space for the import section from Task 10.
- After connecting or disconnecting, run `queryClient.invalidateQueries({ queryKey: ["hardcover"] })`.

- [ ] **Step 1: Write the failing tests**

```ts
it("parses a handoff", () => expect(parseConnectReturn("bookexplorer://hardcover-connected?handoff=abc")).toEqual({ handoff: "abc" }));
it("parses denial", () => expect(parseConnectReturn("exp://1.2.3.4:8081/--/hardcover-connected?error=denied")).toEqual({ error: "denied" }));
it("unknown error values read as failed", ...);
it("returns null for a URL with neither", ...);
// hardcoverSession.test.ts: mock expo-secure-store + AsyncStorage + Platform
it("save → get → clear round-trips in memory and storage", ...);
```

- [ ] **Step 2: Run them and confirm they fail.** `npm test -w apps/app -- hardcoverConnect hardcoverSession`. Expected: FAIL.
- [ ] **Step 3: Implement** the modules, screens and client changes above. Copy UI patterns from `settings.tsx` (`useThemedStyles`, `Button`, `Footer`, `titleRef`).
- [ ] **Step 4: Run the tests and typecheck.** `npm test -w apps/app && npx tsc --noEmit -p apps/app`. Expected: PASS.
- [ ] **Step 5: Manual check.** With a registered dev app and the env set, connect on web and on native (Expo Go). Disconnect, and confirm ShelfThread disappears from Hardcover's Authorized Apps page. Deny consent once, and confirm the app shows "Hardcover wasn't connected."
- [ ] **Step 6: Commit**: `feat(app): My Hardcover Account with OAuth connect`

---

### Task 7: Server: lists and progress on the user's account

**Files:**
- Create: `apps/server/src/sources/hardcoverUser.ts`
- Modify: `apps/server/src/routes/hardcover.ts`, `packages/shared/src/index.ts`
- Test: `apps/server/src/sources/hardcoverUser.test.ts`, `apps/server/src/routes/hardcover.test.ts`

**Interfaces:**
- Consumes: `hardcoverGraphql`, `HardcoverRateLimitError`, `HardcoverUnauthorizedError` (Task 5); `requireUser` (Task 4); `forgetSession` (Task 3); `getWorkDetail` (Task 5); `normalizeIsbn`, `isValidIsbn` (shared); `isOpenLibraryWorkId` (`validation.ts`); `TtlCache` (`cache.ts`)
- Produces (`shared`):
  - `HardcoverListSummarySchema = z.object({ id: z.number().int(), name: z.string(), description: z.string(), booksCount: z.number().int() })`
  - `HardcoverListBooksSchema = z.object({ name: z.string(), description: z.string(), books: z.array(z.object({ hardcoverBookId: z.number().int(), title: z.string(), isbn: z.string().nullable() })) })`
  - `HardcoverProgressSchema = z.object({ status: z.enum(["want", "reading", "read", "paused", "dnf"]).nullable(), percent: z.number().min(0).max(100).nullable() })`, with inferred types
- Produces (`hardcoverUser.ts`; every function takes `authorization: string` last):
  - `findBookId(isbns: string[], auth): Promise<number | null>`: one query `editions(where: {_or: [{isbn_13: {_in: $isbns}}, {isbn_10: {_in: $isbns}}]}, limit: 1) { book_id }`, at most 20 ISBNs, cached 7 days by the sorted, joined ISBNs. Hardcover's book ids are the same for every user.
  - `myLists(auth): Promise<HardcoverListSummary[]>`: `me { lists(order_by: {updated_at: desc}) { id name description books_count } }`
  - `listBooks(listId: number, auth): Promise<HardcoverListBooks>`: `lists_by_pk(id)` with `list_books(order_by: {position: asc}) { book_id book { title default_physical_edition { isbn_13 isbn_10 } } edition { isbn_13 isbn_10 } }`. The ISBN is picked in this order: the list's edition `isbn_13`, its `isbn_10`, the default physical edition's `isbn_13`, its `isbn_10`, then null.
  - `createList(input: { name: string; description: string }, auth): Promise<number>`: `privacy_setting_id: 3`, return shape per Task 0
  - `addListBook(listId: number, bookId: number, auth): Promise<void>`: position per Task 0
  - `removeListBook(listId: number, bookId: number, auth): Promise<void>`: looks up `list_books(where: {list_id, book_id}) { id }`, then runs `delete_list_book(id)` on each. No rows is a no-op.
  - `readingProgress(bookId: number, auth): Promise<HardcoverProgress>`: `me { user_books(where: {book_id: {_eq}}) { status_id edition { pages } book { pages } user_book_reads(order_by: {id: desc}, limit: 1) { progress_pages } } }`. `percent` is set only when the status is `reading` and pages are known: `Math.round(min(100, progress_pages / pages * 100))`. Status 6 or no row gives `{ status: null, percent: null }`.
- Produces (routes; all go through `requireUser`):
  - `GET /api/hardcover/lists` → `HardcoverListSummary[]`
  - `GET /api/hardcover/lists/:listId` → `HardcoverListBooks` | 404
  - `POST /api/hardcover/lists` with `{ name, description }` → `{ id }` (name 1–100 chars, description ≤ 1000, matching `savedLists.ts`)
  - `POST /api/hardcover/lists/:listId/books` with `{ type: "book" | "work", id: string }` → `{ hardcoverBookId }` | `404 { error: "Hardcover doesn't have this book yet." }`
  - `DELETE /api/hardcover/lists/:listId/books/:bookId` → 204
  - `GET /api/hardcover/progress/:type/:id` (`type` is `book` or `work`) → `HardcoverProgress`. A book Hardcover doesn't have answers 200 with nulls.
  - Turning a member into ISBNs is one helper inside the routes file, `memberIsbns(type, id, auth): Promise<string[] | null>`. A `book` gives `[normalizeIsbn(id)]` when the ISBN is valid. A `work` gives `[work.isbn, ...work.editions.map(e => e.isbn)]`, non-null and de-duplicated, from `getWorkDetail(id, auth)`. A malformed id returns null, and the route answers 400.
  - Plugin-scoped `setErrorHandler`: `HardcoverRateLimitError` → `429 { error: "Hardcover is busy. Try again in a minute.", retryAfterSeconds }` with a `Retry-After` header. `HardcoverUnauthorizedError` → `forgetSession(header)` and `401 { error: "Connect your Hardcover account again." }`. Anything else goes to `upstreamErrorHandler`.

- [ ] **Step 1: Write the failing tests**

```ts
// hardcoverUser.test.ts (mock hardcoverGraphql)
it("findBookId sends every ISBN in one query and caches", ...);   // 2 calls with same isbns → 1 graphql call
it("listBooks prefers the listed edition's ISBN, then the default physical edition", ...);
it("listBooks yields isbn null when no edition has one", ...);
it("readingProgress: reading 120/300 → 40%", async () => { /* mock */ expect(await readingProgress(1, "B")).toEqual({ status: "reading", percent: 40 }); });
it("readingProgress: read → percent null", ...);
it("readingProgress: ignored or not shelved → nulls", ...);
it("removeListBook with no matching row makes no delete call", ...);
// routes
it("adding a work with no ISBNs on Hardcover → 404 with the copy above", ...);
it("Hardcover 401 deletes the session and returns 401", ...);
it("Hardcover 429 → 429 with Retry-After", ...);
it("rejects a malformed work id with 400", ...);
```

- [ ] **Step 2: Run them and confirm they fail.** `npm test -w apps/server -- hardcoverUser routes/hardcover`. Expected: FAIL.
- [ ] **Step 3: Implement** the shared schemas, the source and the routes above.
- [ ] **Step 4: Run the server suite and typecheck.** Expected: PASS.
- [ ] **Step 5: Commit**: `feat(server): Hardcover list and reading-progress endpoints`

---

### Task 8: App storage: linked lists and reconcile

**Files:**
- Modify: `apps/app/src/storage/savedLists.ts`, `packages/shared/src/index.ts:375` (`SavedListExportSchema`)
- Create: `apps/app/src/storage/hardcoverReconcile.ts`
- Test: `apps/app/src/storage/savedLists.test.ts`, `apps/app/src/storage/hardcoverReconcile.test.ts`, `apps/app/src/storage/snapshot.test.ts`

**Interfaces:**
- Produces (`savedLists.ts`):
  - `SavedList.hardcoverListId?: number`, `ListMember.hardcoverBookId?: number`
  - `createList(input: { name; description?; kind; hardcoverListId?: number })`
  - `linkList(id: string, hardcoverListId: number | null): Promise<void>`: null unlinks
  - `setMemberHardcoverId(listId: string, type: ListMember["type"], id: string, hardcoverBookId: number): Promise<void>`
  - `replaceMembers(listId: string, members: ListMember[]): Promise<void>`
- Produces (export schema): `hardcoverListId: z.number().int().positive().optional()` on the list, and `hardcoverBookId: z.number().int().positive().optional()` on each member. zod strips unknown keys, so without these a backup round-trip would lose the links.
- Produces (`hardcoverReconcile.ts`): `reconcile(local: ListMember[], remote: HardcoverListBooks["books"], now: number): ListMember[]`, a pure function that decides what a pull does:
  1. Keep a local member with no `hardcoverBookId`. It was never pushed, and the push half of sync handles it.
  2. Keep a local member whose `hardcoverBookId` is in `remote`.
  3. Drop a local member whose `hardcoverBookId` isn't in `remote`. It was removed on Hardcover.
  4. Append each remote book whose id no local member carries: `{ type: "book", id: isbn, title, hardcoverBookId, addedAt: now }`. Skip a remote book with `isbn: null` here; Task 10 reports it.
  5. Keep the local order and append new books in remote order.

- [ ] **Step 1: Write the failing tests**

```ts
it("keeps unpushed local members", ...);
it("drops members removed on Hardcover", ...);
it("adds Hardcover-only books as book members with their ISBN", ...);
it("skips Hardcover books with no ISBN", ...);
it("never duplicates a work already linked to the same Hardcover book", () => {
  const local = [{ type: "work", id: "OL1W", title: "Dune", addedAt: 1, hardcoverBookId: 9 }];
  expect(reconcile(local, [{ hardcoverBookId: 9, title: "Dune", isbn: "9780441013593" }], 2)).toEqual(local);
});
// snapshot.test.ts
it("export → import keeps hardcoverListId and hardcoverBookId", ...);
```

- [ ] **Step 2: Run them and confirm they fail.** `npm test -w apps/app -- savedLists hardcoverReconcile snapshot`. Expected: FAIL.
- [ ] **Step 3: Implement** the setters, schema fields and `reconcile`. No `SCHEMA_VERSION` bump: both fields are optional, so old records stay valid.
- [ ] **Step 4: Run the app suite.** Expected: PASS.
- [ ] **Step 5: Commit**: `feat(app): lists can link to Hardcover lists`

---

### Task 9: App: create lists on Hardcover (3b) and push adds and removes

**Files:**
- Create: `apps/app/src/hardcoverLists.ts`
- Modify: `apps/app/src/api/client.ts`, `apps/app/src/storage/listMembership.ts:36` (`applyListChanges`), `apps/app/src/components/AddToListButton.tsx:22` (`CreateListForm`)
- Test: `apps/app/src/hardcoverLists.test.ts`, `apps/app/src/storage/listMembership.test.ts`

**Interfaces:**
- Consumes: Task 7 routes, Task 8 storage
- Produces (`client.ts`): `fetchHardcoverLists()`, `fetchHardcoverList(id: number)`, `createHardcoverList(input: { name: string; description: string }): Promise<{ id: number }>`, `addHardcoverListBook(listId: number, member: { type: "book" | "work"; id: string }): Promise<{ hardcoverBookId: number }>`, `removeHardcoverListBook(listId: number, bookId: number): Promise<void>`, `fetchHardcoverProgress(type: "book" | "work", id: string)`. A 429 throws `ApiError` with `status === 429` and a `retryAfterSeconds` property, so add `retryAfterSeconds?: number` to `ApiError`.
- Produces (`hardcoverLists.ts`):
  - `pushAdd(list: SavedList, member: ListMember): Promise<"pushed" | "missing" | "skipped">`. It returns `skipped` when the list isn't linked or the member is an author, and `missing` on a 404. On success it calls `setMemberHardcoverId`. Other errors are thrown.
  - `pushRemove(list: SavedList, member: ListMember): Promise<void>`: a no-op unless the list is linked and the member has a `hardcoverBookId`
- `applyListChanges` gains an optional last parameter `onHardcoverIssue?: (message: string) => void`. After each local add or remove on a linked list it calls `pushAdd` or `pushRemove`, catches errors, and reports one of these:
  - `"Saved here, but Hardcover doesn't have this book yet."` (for `missing`)
  - `"Saved here. Hardcover didn't update; use Sync with Hardcover on the list to retry."` (add error)
  - `"Removed here. Hardcover didn't update, so it may come back on the next sync."` (remove error)

  The local write always stands. Callers that already show an error line pass a setter for it.
- `CreateListForm`: when signed in (`getSessionToken()`) and the kind is `book`, show a switch "Also create on Hardcover", off by default. When it's on, call `createHardcoverList` first and then `createList({ ..., hardcoverListId })`. If the Hardcover call fails, show its message and create nothing.

- [ ] **Step 1: Write the failing tests** (mock `../api/client`)

```ts
it("pushAdd stores the returned hardcoverBookId", ...);
it("pushAdd skips authors and unlinked lists without calling the API", ...);
it("pushAdd returns 'missing' on 404", ...);
it("pushRemove does nothing for a member that was never pushed", ...);
// listMembership.test.ts
it("a failed push keeps the local add and reports the retry message", ...);
```

- [ ] **Step 2: Run them and confirm they fail.** Expected: FAIL.
- [ ] **Step 3: Implement** the client functions, `pushAdd`, `pushRemove` and the form switch.
- [ ] **Step 4: Run the app suite and typecheck.** Expected: PASS.
- [ ] **Step 5: Commit**: `feat(app): create lists on Hardcover and push list changes`

---

### Task 10: App: import (3d), migrate (3e) and sync

**Files:**
- Modify: `apps/app/src/hardcoverLists.ts`, `apps/app/app/hardcover.tsx`, `apps/app/app/lists/[id].tsx`
- Test: `apps/app/src/hardcoverLists.test.ts`

**Interfaces:**
- Consumes: Tasks 8–9
- Produces (`hardcoverLists.ts`):
  - `importList(hardcoverListId: number): Promise<{ list: SavedList; skipped: string[] }>`: `fetchHardcoverList`, then `createList({ name, description, kind: "book", hardcoverListId })`, then `replaceMembers` with `reconcile([], books, now)`. `skipped` holds the titles of books with no ISBN.
  - `copyToHardcover(list: SavedList, onProgress: (done: number, total: number) => void, sleep = (ms: number) => new Promise(r => setTimeout(r, ms))): Promise<{ missing: string[]; skippedAuthors: number }>`: creates the Hardcover list if the local one isn't linked and calls `linkList`, then runs `pushAdd` once per member that has no `hardcoverBookId`, one at a time. On a 429 it runs `await sleep(retryAfterSeconds * 1000)` and retries **the same member**. Calling it again after an interruption resumes, because pushed members already carry ids.
  - `syncWithHardcover(list: SavedList): Promise<{ missing: string[]; skipped: string[] }>`: `copyToHardcover` (push half), then `fetchHardcoverList`, then `replaceMembers(reconcile(...))`
- `hardcover.tsx` (connected state) gains an "Import a list from Hardcover" section. It lists `fetchHardcoverLists()` rows as "name · N books", each with an Import button. A Hardcover list already linked to a local list shows "Imported", with a link to that list. After an import it routes to the new list and shows the skipped titles.
- `lists/[id].tsx`, for book lists only:
  - Unlinked, signed in: a "Copy to Hardcover" button, showing "Copying 12 of 40…" while it runs.
  - Linked: a "Sync with Hardcover" button and an "Unlink" text button, which runs `linkList(id, null)` and leaves Hardcover untouched.
  - Afterwards, one summary line, for example "Hardcover doesn't have: Title A, Title B."
  - Author lists show neither button.

- [ ] **Step 1: Write the failing tests**

```ts
it("copyToHardcover waits Retry-After on 429 and retries the same member", async () => {
  // addHardcoverListBook: ok, 429(retryAfterSeconds 30), ok, ok
  const sleep = vi.fn().mockResolvedValue(undefined);
  await copyToHardcover(list3, () => {}, sleep);
  expect(sleep).toHaveBeenCalledWith(30_000);
  expect(addHardcoverListBook).toHaveBeenCalledTimes(4);
  expect(vi.mocked(addHardcoverListBook).mock.calls.map((c) => c[1].id)).toEqual(["a", "b", "b", "c"]);
});
it("copyToHardcover reports missing titles and continues", ...);
it("copyToHardcover counts and skips authors", ...);
it("copyToHardcover resumes: already-pushed members are not re-sent", ...);
it("importList creates a linked book list and reports ISBN-less titles", ...);
```

- [ ] **Step 2: Run them and confirm they fail.** Expected: FAIL.
- [ ] **Step 3: Implement** the three functions and the UI above.
- [ ] **Step 4: Run the app suite and typecheck.** Expected: PASS.
- [ ] **Step 5: Manual check.** Import a real Hardcover list. Add a book in ShelfThread and confirm it appears on hardcover.app. Remove a book on hardcover.app, press Sync, and confirm it's gone here. Copy a 3-book local list and confirm it appears on Hardcover as private.
- [ ] **Step 6: Commit**: `feat(app): import, copy and sync lists with Hardcover`

---

### Task 11: Reading progress on book and work pages (3f)

**Files:**
- Create: `apps/app/src/components/HardcoverProgress.tsx`, `apps/app/src/hardcoverProgressLabel.ts`
- Modify: `apps/app/app/book/[isbn].tsx`, `apps/app/app/work/[id].tsx` (render it near the existing rating, inside the detail header area)
- Test: `apps/app/src/hardcoverProgressLabel.test.ts`

**Interfaces:**
- Consumes: `fetchHardcoverProgress` (Task 9), `getSessionToken` (Task 6)
- Produces: `progressLabel(p: HardcoverProgress): string | null`, with this exact copy: `want` → "On your Want to Read shelf", `reading` with a percent → "Reading · 40%", `reading` without one → "Currently reading", `read` → "Read", `paused` → "Paused", `dnf` → "Did not finish", `null` → null.
- `<HardcoverProgress type="book" | "work" id={string} />`: `useQuery({ queryKey: ["hardcover", "progress", type, id], enabled: !!getSessionToken(), staleTime: 5 * 60_000 })`. It renders nothing when signed out, while loading, on error, or when the label is null. Otherwise it renders the label followed by " on Hardcover", in the house text style, with `accessibilityRole="text"`.

- [ ] **Step 1: Write the failing test** (one `it.each` over the copy table above)
- [ ] **Step 2: Run it and confirm it fails.** Expected: FAIL.
- [ ] **Step 3: Implement** the label function, the component and the two page placements.
- [ ] **Step 4: Run the app suite and typecheck.** Expected: PASS.
- [ ] **Step 5: Commit**: `feat(app): show Hardcover reading progress on book and work pages`

---

### Task 12: Follow an author on Hardcover (3c, only if Task 0 step 5 found support)

**Skip this task entirely if the Task 0 notes say "not supported".**

**Files:**
- Modify: `apps/server/src/sources/hardcoverOAuth.ts` (`HARDCOVER_SCOPES` += ` write:social`), `apps/server/src/sources/hardcoverUser.ts`, `apps/server/src/routes/hardcover.ts`, `apps/app/src/api/client.ts`, `apps/app/app/author/[id].tsx`
- Test: `apps/server/src/sources/hardcoverUser.test.ts`

**Interfaces:**
- Produces:
  - `findAuthorId(name: string, auth): Promise<number | null>`: an exact-name match on `authors(where: {name: {_eq}}, limit: 2)`. Return null when there are 0 or 2+ matches; it doesn't guess between namesakes.
  - `followAuthor(authorId: number, auth): Promise<void>`: the exact mutation from the Task 0 notes
  - Route `POST /api/hardcover/follow/author` with `{ name: string }` → 204 | `404 { error: "Couldn't find this author on Hardcover." }`
  - Author page: a "Follow on Hardcover" button when signed in.
- Existing sessions don't have the new scope. A missing-scope GraphQL error must show "Reconnect Hardcover to allow following authors." with a link to `/hardcover`.

- [ ] **Step 1: Write the failing tests:** an ambiguous name returns null; a missing-scope error maps to the reconnect message.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run both suites and typecheck.** Expected: PASS.
- [ ] **Step 5: Commit**: `feat: follow authors on Hardcover`

---

### Task 13: Production setup on the droplet (the owner does this; the executor stops and asks)

The owner has to do these steps by hand on the droplet. Secrets must never pass through the agent. **The executor stops here and asks the owner to do each step, then waits for a "done" on each.** No code changes.

Local `.env` already holds the **dev** Hardcover app's credentials under the production names. The droplet's `.env` gets the **production** app's values under the same names.

- [ ] **Step 1: Ask the owner to generate a new token key on the droplet.** Run `openssl rand -base64 32` on the droplet and save the output as `HARDCOVER_TOKEN_KEY=` in the droplet's server `.env`. Don't reuse the laptop's key. Once users connect, never change it, or every saved session becomes unreadable and everyone must reconnect.
- [ ] **Step 2: Ask the owner to set up the account database.** Create a folder that survives redeploys, for example `sudo mkdir -p /var/lib/shelfthread`, and give the server's user ownership of it. Then add `ACCOUNT_DB_PATH=/var/lib/shelfthread/accounts.db`. Add that file to whatever backs up the droplet: losing it disconnects every user.
- [ ] **Step 3: Ask the owner to set the production Hardcover credentials.** In the droplet's `.env`, set `MY_HARDCOVER_CLIENT_ID` and `MY_HARDCOVER_CLIENT_SECRET` to the **production** Hardcover app's values, not the dev app's. Set `HARDCOVER_REDIRECT_URI=https://api.shelfthread.com/api/hardcover/callback`, which must match the URI registered on the production app exactly. Check that `PUBLIC_WEB_URL=https://shelfthread.com` is set; the allowed return URLs come from it.
- [ ] **Step 4: Ask the owner to check the production Hardcover app's settings.** Only `https://api.shelfthread.com/api/hardcover/callback` should be registered, with no localhost entries. Device Authorization Grant should be off. The allowed scopes must include `read:me:content read:catalog read:lists write:lists read:library`, plus `write:social` if Task 12 shipped.
- [ ] **Step 5: Deploy and smoke test.** Restart the server and run `curl -s https://api.shelfthread.com/api/hardcover/session` with the production `X-App-Key`. Expect a 401, not a 503; a 503 means an env var is missing. Then connect from https://shelfthread.com and from a native build, import a list, and confirm ShelfThread appears on Hardcover's Authorized Apps page.
- [ ] **Step 6: Decide on `HARDCOVER_API_KEY`.** It now only covers signed-out visitors. Keep it, or remove it from the droplet's `.env` to stop sharing the personal key entirely; signed-out users then see no Hardcover ratings or reviews.
