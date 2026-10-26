# Feature Roadmap: Discovery, Library, Search, Sync, Ops

Status: phases 0-4 implemented; phase 5 (sync) deliberately deferred, see the status table below. Items are numbered to match the original idea list (5, reading
status/notes, is deliberately not included). Each phase should get its own
brainstorming spec and task-level plan (as with `2026-10-21-lcsh-source-tagging.md`)
before implementation; this document fixes scope, order, and the sync decision.

Assumptions I did not verify in code (check when writing each phase's spec):
the graph screen already keeps a `center` + `history` stack (so tap-to-recenter and
back may exist); search is `Open Library /search` only; saved data lives entirely in
AsyncStorage (`savedItems`, per-ISBN `savedBook` records, `libraries`, `history`).

## Recommended order

| Phase | Items | Why here |
|---|---|---|
| 0 | 12 a11y, 14 persistent server cache, storage versioning | Cheap, unblocks others |
| 1 | 10 ISBN fallback, 9 search filters, 13 share/deep links | Small, user-visible, server-light |
| 2 | 6 export/import, 11 offline cache | Both need the storage-versioning work; 6 is the sync escape hatch |
| 3 | 8 batch scan, 4 series | Independent features |
| 4 | 3 graph filters, 1 path finder, 2 recommendations | Graph/discovery; share a graph-query API |
| 5 | 7 sync | Last: needs stable data model (phase 0, 2) and the SQLite store (14) |

## Status (2026-10-26)

Checked against the code by symbol and file search, not by running every feature.

| Item | State |
|---|---|
| 12 a11y | Implemented per `accessibilityFixPlan.txt` (button roles/labels, hidden glyphs, headings, hit slop, focus ring, contrast). Input-border contrast re-tuned on 2026-10-26 for the cream background. Still open: a non-visual alternative to the graph canvas. |
| 14 persistent cache, storage versioning | Implemented |
| 10 ISBN fallback, 9 search filters, 13 share links | Implemented (share-link host still undecided, see open questions) |
| 6 export/import, 11 offline cache | Implemented |
| 8 batch scan, 4 series | Implemented |
| 3 graph filters, 1 path finder, 2 recommendations | Implemented |
| 7 sync | **Deferred.** Decision 2026-10-26: keep manual export/import as the sync story, because the app aims to store as little as possible off-device. Option C below stays the design to revive if a hosted server with persistent disk is approved. |

---

## Phase 0: Foundations

### 12. Finish accessibility fixes
- `accessibilityFixPlan.txt` (repo root) is a written WCAG 2.2 AA plan in six phases
  (Button label/role props, row roles + hidden decorative glyphs, contrast tokens in
  `theme.ts`, target sizes, headings + focus style, text reflow).
- Step 1: diff the plan against the code to see what is already done (grep for
  `accessibilityRole`, `hitSlop`, the `textFaint` / `inputBorder` values).
- Step 2: implement the remainder as the plan describes; `npx tsc --noEmit` and the
  vitest suite after each phase.
- Step 3: new screens in this roadmap (path finder, filters, batch scan) must ship
  with roles/labels from the start; add this to each phase's checklist.
- Open: graph canvas (`graph/[type]/[id].tsx`, SVG) needs a non-visual alternative.
  The node list view added in #3 doubles as that.

### 14. Persistent server cache
- Today `TtlCache` is in-memory with in-flight de-dupe; restarts mean cold Wikidata
  SPARQL (slow, rate limited).
- Add an optional second tier under `TtlCache.wrap`: on memory miss, read SQLite
  (`better-sqlite3`, one file, `CACHE_DB_PATH` env, default off so dev is unchanged);
  on fetch, write through with expiry. Values are JSON; key = existing cache key plus
  a per-service namespace and a schema-version constant so shape changes invalidate.
- Keep the existing de-dupe, and keep failed/degraded results short-lived (the
  `DEGRADED_TTL_MS` behaviour must carry over to the persistent tier).
- Periodic purge of expired rows (on startup + hourly).
- Tests: wrap hits SQLite after memory eviction; expired rows ignored; degraded TTL
  respected; DB unavailable falls back to memory only.
- This same SQLite file/dependency is reused by sync (#7), but use a separate DB file.

### Storage versioning (prerequisite for 6, 7, 11)
- Add `schemaVersion` plus `updatedAt` to every synced/exported record type
  (`SavedItem`, `SavedBookRecord`, `Library`), and a `deletedAt` tombstone for items
  and books. Write a one-time migration at startup (same pattern as
  `migrateLegacyLibrary`).
- Put a `getSnapshot()` / `applySnapshot()` pair in `src/storage/` returning the whole
  user dataset as one typed object. Export, import, and sync all use it, and so does
  the offline cache's "what is saved" check.
- Do not include `themePreference` or `history` (recents) in the snapshot; they are
  per-device.
- Tests: migration idempotent; snapshot round-trip; tombstoned items hidden from
  `getSavedItems`.

---

## Phase 1: Search and sharing

### 10. ISBN-miss fallback
- On a not-found ISBN (404 from `/api/books/isbn/:isbn`, rendered by `ErrorState`),
  offer "Search by title instead" (prefills `/search`) and automatically retry the
  other ISBN form (10 to 13 or 13 to 10) once before showing the error. The server
  already has `tryEachIsbn`; check whether it covers this and extend rather than
  duplicate.
- Pure helper `toAlternateIsbn(isbn)` with unit tests (checksum cases, 978 vs 979
  which has no ISBN-10).

### 9. Search filters
- Server: extend `GET /api/search` with `author`, `subject`, `language`, `yearFrom`,
  `yearTo`, `sort`. Map to Open Library's query syntax (`author:`, `subject:`,
  `language:`, `first_publish_year:[a TO b]`) and validate/escape every value at the
  route (query-injection and the 3-char minimum in `searchService`). Include all
  filters in the cache key.
- App: a collapsible filter row on `search.tsx` (mode chips: Title / Author /
  Subject; year range; language). Persist the last choice per device.
- Tests: query building (escaping, ranges), cache keys differ per filter, route
  rejects malformed years.

### 13. Share and deep links
- Scheme `bookexplorer://` already exists; add (a) a Share button on book/work/author/
  subject pages using RN `Share` (web: Web Share API, fallback copy-link), and (b)
  web URLs that mirror `routes` so shared links open the same screen in the browser
  build.
- Decide the public web host before building (open question below). Until one
  exists, share the scheme link and the Open Library URL.
- Graph links include `type` + `id` + optional filter state (from #3) in the query
  string.
- Tests: `routes` round-trip (build URL, parse back) for every route.

---

## Phase 2: Portability and offline

### 6. Export / import
- Export: `getSnapshot()` to JSON (canonical, lossless, versioned) and CSV (books
  only: ISBN, title, authors, tags, notes, saved date; Goodreads column names where
  they exist so imports elsewhere work). Native: `expo-sharing` + `expo-file-system`;
  web: Blob download.
- Import: JSON restores via `applySnapshot` with a merge strategy (default: union,
  newer `updatedAt` wins; option: replace). Goodreads/StoryGraph CSV import: map ISBN13
  column, then fetch/save each book through the normal `saveBookFromApi` path, rate
  limited and resumable (progress UI; skip rows without ISBN and list them at the end).
- Validate imports with a zod schema in `packages/shared` (untrusted input); cap file
  size and record count.
- Tests: snapshot round-trip; merge conflicts; malformed JSON; CSV quoting/BOM.

### 11. Offline cache of viewed books
- Client-side response cache for `GET` detail calls (book, work, author, subject):
  persist the last good zod-validated response per key with `fetchedAt`. Use
  stale-while-revalidate with React Query's persister
  (`@tanstack/query-async-storage-persister`) rather than a hand-rolled store.
- Policy: always keep detail for saved items (never evicted); LRU cap (about 50) for
  everything else; show an "offline, last updated X" banner when serving stale data
  after a network failure.
- Covers/images: rely on `expo-image` disk cache for saved items only.
- Graph: cache the graph response for saved items too; otherwise online-only.
- Tests: serves stale on failure; eviction never removes saved items; schema bump
  invalidates.
- Overlap with #14: this is the client tier, #14 is the server tier. Cache keys are
  independent.

---

## Phase 3: Scanning and series

### 8. Batch scanning
- Add a "Scan multiple" mode to `scan.tsx`: camera stays open, each new ISBN is
  de-duped against the session, haptic + toast on capture, appended to a session list
  (title resolves in the background through `getBookDetail`). Finish screen lets the
  user pick a library/tag set and saves all via `saveBookFromApi`, with per-row
  failure state and retry.
- Debounce repeated reads of the same barcode (about 2 s) and ignore non-ISBN
  barcodes (978/979 prefix + checksum).
- Accessibility: announce each capture; a manual "Add" button per scan since camera
  UIs are hard for screen-reader users.
- Tests: ISBN filter, de-dupe window, partial-failure save.

### 4. Series / "more by this author"
- Server: add series data to `Work` (`series?: { name, position, wikidataId }`) from
  Wikidata (P179 "part of the series", P1545 "series ordinal"); add
  `GET /api/series/:qid` listing members in order. Add "more by this author" to
  `getWorkDetail`/`getAuthorDetail` from Open Library's author works endpoint
  (excluding the current work), capped.
- Both are optional enrichments through the existing `optionalSource` path: failure
  must not fail the work page.
- App: "Series" section on the work page (ordered list with a "you are here" marker);
  "More by this author" strip. Reuse `WorkListRow`.
- Tests: ordinal parsing (non-numeric ordinals like "2.5", "A"), missing series,
  de-dupe of the same series from two sources.

---

## Phase 4: Graph and discovery

Shared groundwork: a pure `graphQuery` module in `apps/server/src/services/` (BFS
over the cached author/work/subject services) that both #1 and #2 call, so neither
re-fetches data the graph already caches.

### 3. Graph filters
- Client-only first: a filter sheet on the graph screen with checkboxes by node type
  and by edge relation (`influencedBy`, `influenced`, `notableWork`, `movement`,
  `broader`, `narrower`). Filtering removes nodes/edges, then re-runs the layout
  (keeps `cleanGraph` invariants: no dangling edges).
- Also add a list view of visible nodes. It is the accessible alternative to the SVG
  canvas (item 12) and a way to focus a node without pinch-zoom.
- Verify before building whether tap-to-recenter/back already exist (the screen has
  `center` and `history` state); if so, skip them.
- Persist filter state in the route query so shared links (#13) restore it.
- Tests: filter function (no orphan edges, centre never removed), URL (de)serialising.

### 1. Cross-book path finder
- Server: `GET /api/path?from=work:OL..W&to=author:OL..A` (node ids use the existing
  `type:id` prefixes). Bidirectional BFS over a lazily expanded neighbourhood built
  from the cached services, depth cap (about 4) and node cap (about 300), overall
  time budget; returns the node/edge list for the shortest path or `{found:false}`.
- Cost warning: each expansion can trigger Open Library/Wikidata calls. Rely on the
  cache (#14), cap fan-out, and rate-limit the route more tightly than the others.
- App: "Find connection" entry on book/work/author pages, a picker for the second
  endpoint (reuse search), result rendered as a vertical chain with edge labels,
  with a "show on graph" button reusing the graph renderer.
- Tests: BFS on a fixture graph (shortest path, no path, cycle, cap hit); route
  validation of ids.

### 2. Recommendations from your library
- Compute locally from the snapshot: gather subjects/authors from saved books/works
  (the `SavedBookRecord.subjects/genres` snapshot already exists), score candidate
  works by shared subjects weighted by rarity (idf over the user's own counts) plus
  author-influence edges, exclude anything already saved.
- Candidates come from `/api/subjects/:slug` for the user's top N subjects and
  `/api/graph/author/:id` neighbours. Fetch in a bounded batch, since the client
  holds the taste profile and the server stays stateless (nothing about the user's
  library is sent beyond individual public subject/author ids).
- App: "Because you saved X" rows on Home/Saved, each with a one-line explanation
  ("shares: historical fiction, Napoleonic Wars").
- Tests: the scoring function is pure; fixture libraries give deterministic ranking;
  empty library shows nothing.

---

## Phase 5: 7. Sync across devices

### Requirements and constraints
Library data (saved items, tags, notes, library URLs) is personal. Notes and the
user's own library website URLs are the most sensitive parts. Goals, in priority
order: minimal privacy exposure, minimal operating burden, works on iOS/Android/web,
no lock-in.

### Options

| # | Option | Account? | Privacy | Effort | Cross-platform | Verdict |
|---|---|---|---|---|---|---|
| A | Manual export/import (#6) | None | Best: nothing leaves your control | Already done by #6 | Yes | Ship first; it is the fallback for every other option |
| B | Platform sync (iCloud key-value / CloudKit, Android Auto Backup) | The OS account | Good (Apple/Google hold it) | Medium; needs native modules / dev client, no Expo Go; nothing for web | iOS-to-iOS, Android-to-Android only | Poor fit for a web+Android+iOS codebase |
| C | **Sync key + end-to-end encrypted blob** (no accounts) | None; a random key *is* the identity | Excellent: server stores only ciphertext it cannot read, no email, no identifier | Low-medium; one small server table | Yes | **Recommended** |
| D | Accounts (email/passkey) + E2E encryption | Yes | Good, but the server now holds emails and credentials | High (auth, reset flows, abuse, account deletion) | Yes | Unneeded complexity unless you want sharing between people |
| E | Bring your own storage (Dropbox/Drive/WebDAV file) | The user's existing cloud account | Good; user chooses the provider | Medium-high (OAuth per provider; PKCE on native + web) | Yes | Good later add-on, not the first step |
| F | Peer-to-peer / CRDT (Automerge, Yjs + WebRTC) | None | Good | High, and fragile when both devices are not online together | Mostly | Overkill |
| G | Plain accounts, unencrypted server DB | Yes | Worst: server sees notes | Medium | Yes | Rejected |

### Recommended design: Option C (anonymous, end-to-end encrypted sync key)

Think "Firefox Sync meets a password manager recovery key" without the account.

1. **Enable sync.** The app generates 256 random bits (the *sync secret*) and stores
   it in the device keychain (`expo-secure-store`; web falls back to IndexedDB, with
   the caveat that browser storage is weaker).
2. **Derive two things from the secret** with HKDF: `syncId` (public lookup key sent
   to the server) and `encKey` (never leaves the device). Cannot derive one from the
   other.
3. **Add another device.** Settings shows the secret as a QR code plus a 24-word
   phrase (BIP-39 style) for typing. The new device scans or enters it and derives
   the same two values. No server involvement in pairing, so no account or email.
4. **Wire format.** The client serialises `getSnapshot()`, encrypts with AES-256-GCM
   (via WebCrypto on web / `expo-crypto` or `react-native-quick-crypto` on native; a
   fresh random nonce per write), and PUTs `{ciphertext, nonce, baseVersion}`.
5. **Server (new, tiny).** Table `sync_blobs(sync_id PRIMARY KEY, version INTEGER,
   ciphertext BLOB, updated_at)` in its own SQLite file.
   - `GET /api/sync/:syncId` returns `{version, ciphertext, nonce}`, or 404.
   - `PUT /api/sync/:syncId` is a compare-and-swap on `version` (HTTP 409 plus the
     current blob on a conflict). Cap blob size (about 2 MB), rate-limit hard,
     validate `syncId` as exactly 64 hex chars.
   - `DELETE /api/sync/:syncId` wipes the data ("turn off sync everywhere").
   - No logs of IP-to-syncId; stop storing request IPs for these routes. Inactive
     blobs expire (for example after 12 months, announced in the UI).
   Because the server only sees ciphertext and a random id, a database leak exposes
   nothing readable, and there is nothing personal to delete on request.
6. **Merge, not overwrite.** On a 409 (or on pull), the client decrypts the remote
   snapshot and merges per record: higher `updatedAt` wins; tombstones (`deletedAt`)
   win over older edits so deletions propagate; tags merge as a set union of
   adds/removes; notes are whole-field last-writer-wins. Then re-encrypt and retry
   the PUT with the new version. Merge is a pure function with unit tests, and
   `applySnapshot` from #6 is reused.
7. **When it runs.** Pull on app start/foreground, push (debounced about 5 s) after
   a local write via the existing `enqueueWrite` hook. Show "last synced" and an
   error state; sync failure never blocks local use.
8. **Not synced:** theme, recents, anything fetched from public APIs (re-fetched or
   offline-cached per device).

**Honest trade-offs of C:** lose the secret on every device and the data is
unrecoverable (mitigation: show the phrase once, nudge users to take an export from
#6); anyone who obtains the secret can read and overwrite the data (treat it like a
password, and offer "rotate key": re-encrypt under a new secret and delete the old
blob); the server can see *that* a syncId exists, its size and write timing; no
sharing libraries between different people (that requires D); web key storage is
weaker than the native keychain. Collision/guessing risk is nil at 256 bits.

**Upgrade path:** C can later gain optional passkey-based accounts that just wrap the
same secret (so a recovery path exists) without changing the blob format; E (BYO
storage) can swap the transport and keep the same encrypted payload.

### Tasks
1. Crypto module (`src/sync/crypto.ts`): HKDF split, encrypt/decrypt, phrase
   encode/decode. Tests: round-trip, wrong key fails, nonce uniqueness, phrase
   vectors.
2. Merge function + tests (all conflict classes above, tombstones, idempotence,
   commutativity).
3. Server `routes/sync.ts` + `services/syncStore.ts` (SQLite, CAS, size cap, rate
   limit). Tests: version conflict, oversize, invalid id, delete.
4. Client sync engine (pull/merge/push loop, offline queue, backoff) + settings UI
   (enable, show QR/phrase, add device, rotate key, turn off and delete).
5. Privacy copy in-app and in the README ("what the server can and cannot see").
6. Manual cross-device test script (two simulators + web).

---

## Open questions for you
1. **Public web host** for share links (#13): does the web build get a permanent
   domain? Affects link format and whether share links work for non-installers.

   Answer: there will be a domian but that is not finalized so hold off.
2. **Backend hosting** is currently local/dev. #14 and #7 assume a deployed server
   with a persistent disk; where will it run?
   Answer: There will be a server hosting the application, but the main goal of the application has been that it stores as little as possible off a user's device. If necessary, hold off on changes that need this.
3. **Sync secret UX:** is a QR/24-word phrase acceptable, or do you want e-mail
   magic links (that reintroduces an account and PII, option D)?
   start with QR/24-word phrase
4. **Goodreads import (#6):** is CSV-only enough, or should it also accept StoryGraph
   exports (similar columns, small extra mapping)?
   should accept storygrpah.
5. **Recommendation weighting (#2):** purely subject/author similarity, or also use
   Hardcover/Google ratings already fetched?
   Answer: use the ratings


## Out of scope / not checked
Reading status and notes UI (#5); any code verification beyond the file listing and a
skim of storage and search; performance of path finding on real Open Library/Wikidata
latency (needs a spike before committing to depth 4).
