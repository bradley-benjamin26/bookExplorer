# Plan: Editable Saved Works, Honest Recommendation Headings, Detail Backfill, Upstream Rate Limits

Status: implemented (see the saved-works, recommendations and prefetch commits on main). Original note: run
task 4 first, because it is independent and protects later testing. Then run
1 → 2 → 3, because tasks 2 and 3 build on task 1's work records.

## Background (verified in code, 2026-10-22)

- A saved work is only a `SavedItem` (`{type: "work", id, title}`). It has no
  record like `SavedBookRecord`, which carries `subjects`, `genres` and `notes`
  (`apps/app/src/storage/savedBooks.ts:30-42`). Because of this, the editor
  (`SavedBookEditor`) only exists on the book page, and saved works add no
  subjects to recommendations.
- The work page saves with `toggleSaved` (`apps/app/app/work/[id].tsx:43`). That
  is the same toggle-on-save pattern that caused the book-page data-loss bug
  (fixed in a65aaa7 with `saveBook`/`unsaveBook`).
- The recommendation heading credits one saved title per recommendation
  (`explain()`, `apps/app/src/recommendations.ts:158-162`). When several saved
  books share a subject, they tie and the alphabetically first title wins, so
  one book (e.g. "A Court of Thorns and Roses") heads almost every group.
- Recommendations only use a saved book if its API detail is in the query cache
  (`RecommendationsSection.tsx:55-61`). This is what keeps user-typed tags from
  being sent to the server. As a result, saved books whose detail isn't cached
  contribute nothing.

## Global constraints

- The owner's principle is to store as little as possible off the device. Only
  individual public ids, ISBNs and subject slugs go to the server. User-typed
  tags and notes never leave the device, except in exports the user makes.
- Write tests alongside every behaviour change (vitest). Run
  `npx tsc --noEmit` and `npm test` in every touched workspace.
- WCAG 2.2 AA: new controls get role, label and state, headings use
  `accessibilityRole="header"`, and contrast uses theme tokens.
- Make the smallest correct change in the existing style. Reuse the existing
  helpers: `stamp`, `Versioned`, `enqueueWrite`, `ensureSaved`, `mergeSnapshots`
  and the zod export schemas.
- End commit messages with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.

---

### Task 1: Editable saved works (subjects, genres, notes)

**Storage** (`apps/app/src/storage/`)
- Add `savedWorks.ts`, modelled on `savedBooks.ts`:
  - `SavedWorkRecord extends Versioned` holds `{ openLibraryWorkId, title,
    authorNames, subjects, genres, notes, savedAt, deletedAt? }`.
  - Each record gets its own key, `book-explorer:saved-work:<workId>`.
  - Add these functions:
    - `saveWorkFromApi(work)`: returns the existing live record untouched, or
      creates a new record seeded from the work's API subjects and genres.
    - `getSavedWork(id)`.
    - `updateSavedWork(id, changes)`: refuses to edit a tombstoned record.
    - `removeSavedWork(id)`: writes a tombstone with the content blanked, the
      same way as `withoutContent` in `savedBooks.ts`.
    - `getAllSavedWorks()`.
    - `replaceSavedWorks()`.
    - `saveWork(work)` / `unsaveWork(id)`: pair the record with
      `ensureSaved`/`removeSaved`, mirroring `saveBook`/`unsaveBook`.
- Snapshot (`snapshot.ts`):
  - Add `works: SavedWorkRecord[]` to `Snapshot`, and handle it in
    `getSnapshot`/`applySnapshot`.
  - Raise the snapshot `schemaVersion` to 2.
  - Bump `SCHEMA_VERSION` and add a migration step. For each live saved work
    item with no record, create a minimal record (title from the item, empty
    subjects, genres and notes, `updatedAt` taken from the item). The migration
    must be idempotent.
- Merge (`mergeSnapshot.ts`):
  - Merge `works` with the same per-record rules as books: newer `updatedAt`
    wins, a tombstone wins a tie, and subjects and genres are a set union.
  - Extend `reconcile` so a `work:<id>` item and its work record can't disagree
    about whether the work is saved (the same rule as for books).

**Export / import**
- `packages/shared`: add `SavedWorkExportSchema` and add `works` to
  `SnapshotExportSchema`.
  - Accept `schemaVersion` 1 or 2. A v1 backup has no `works`; treat it as
    `works: []`.
  - Keep the compile-time `Same<SnapshotExport, Snapshot>` check passing.
- CSV export stays books-only, matching Goodreads. No change.

**UI**
- Generalise `SavedBookEditor` into an editor that works for both record kinds.
  Pass the record plus an `update` function, so the component stops importing
  `updateSavedBook` directly. Keep its existing behaviour and accessibility.
- `app/work/[id].tsx`:
  - Replace `toggleSaved` with `saveWork`/`unsaveWork`, keeping the cover
    prefetch.
  - Look up the saved record on focus.
  - Render the editor when the work is saved.
- `app/saved.tsx`: the unsave path for works uses `unsaveWork`.

**Tests**
- Migration creates records for existing saved works and is idempotent.
- `saveWork` never unsaves and keeps existing notes, including when two calls run
  at once.
- A tombstoned work loses its notes and tags.
- Snapshot round-trip includes works.
- Merge: works conflicts, tombstones, and work item vs record reconciliation.
- Import accepts v1 (no works) and v2, and rejects malformed works.

---

### Task 2: Recommendation headings by shared reason, not by alphabetical title

- `recommendations.ts`:
  - Replace `explain()`'s "credit one saved title" rule. Each recommendation
    gets a primary `reason`: its single highest-weight evidence entry. Ties go
    to more saved books sharing it, then the label. Each recommendation also
    carries that reason's saved titles.
  - Keep `shares` as the full list of reasons, for the one-line explanation.
  - Grouping key = primary reason.
- `RecommendationsSection.tsx`: group by primary reason. Headings:
  - Subject: "Because you like {label}" plus "({n} saved)" when more than one
    saved item shares it.
  - Author: "More by {author}".
  - Influence: "Influenced by {author}" or "Connected to {author}". Pick one
    wording and keep it consistent.
- The row accessibility label still includes the explanation. Headings keep
  `accessibilityRole="header"`.
- Saved works (from task 1) take part as seeds, with the same split between
  public and private subjects as books. Their public slugs come from the cached
  `["work", id]` detail.
- Tests:
  - With two saved books sharing a subject, the group is keyed by the subject,
    not by the alphabetically first title.
  - Grouping is deterministic.
  - A saved work's API subjects count.
  - A saved work's user-typed subjects are never in the fetched slug list.

---

### Task 3: Fetch missing saved-item details in the background

- Add a small hook, mounted once after `migrateStorage` in `app/_layout.tsx`.
  For each live saved book with no `["book", isbn]` cache entry, and each live
  saved work with no `["work", id]` entry, it calls `queryClient.prefetchQuery`
  with the same query function the detail screens use:
  - Books use `fetchBookWithAlternate`.
  - Works use `fetchWork`.
- Run with bounded concurrency (named constant, e.g. 2) and a short delay
  between requests (named constant). Run once per app session. Skip when the
  network fails, and leave failed items for the next session. Run again when the
  saved list grows, for example after a CSV or JSON import.
- These are the same per-item public lookups the detail pages already make.
  Nothing about the library as a whole is sent. Write one comment saying so.
- The persisted offline cache then keeps these entries, because saved items are
  exempt from eviction.
- Tests:
  - The pure "which items need fetching" function returns only uncached live
    items and skips tombstones.
  - Concurrency and delay are respected; use fake timers.
  - A failed fetch doesn't stop the rest.

---

### Task 4: Upstream rate-limit protection (server)

**Why (observed 2026-10-22):** one person testing was enough to get this
machine blocked by openlibrary.org, which refused connections in under 0.1 s
while covers.openlibrary.org, archive.org and Wikidata answered normally.
Hardcover returned 199 × 429 in the same dev-server log. Two things in the code
make this worse:
- `fetchWithTimeout` (`apps/server/src/httpClient.ts:14-75`) retries every
  network error and 5xx up to 3 times, so a refused connection triples the
  calls.
- It has no notion of 429 or `Retry-After`, and nothing limits calls across
  requests. The path finder (up to 80 expansions × 4 at a time), the
  recommendations, the CSV import and the background detail fetch all add up
  from one server IP.

**Changes** (all in `httpClient.ts` unless noted; every source already goes
through `fetchWithTimeout`):
- **Shared limit per upstream host.** One limiter keyed by URL host caps the
  requests per second and the number of concurrent requests to that host. These
  are named constants per host, with a conservative default:
  - openlibrary.org: about 3/s, 4 at a time.
  - Hardcover: a lower limit.
  - Wikidata: about 5/s.

  Callers queue instead of failing. The limit is shared by all users of the
  server process, not per user.
- **Back off when told to.**
  - On 429 or 503 from a host, open a cooldown for that host. Use
    `Retry-After` when it's present (seconds or an HTTP date). Otherwise use
    exponential backoff starting at about 30 s, capped at about 10 min.
  - Do the same when a connection is refused or times out repeatedly, which is
    what today's block looked like.
  - During the cooldown, calls to that host fail fast with a typed `Upstream
    unavailable` error and are not retried.
  - Requests that already succeeded stay cached, so the app keeps working from
    cache.
- **No retries while a host is cooling down.** Keep the existing retry for
  one-off 5xx and network blips, but stop retrying 429s and refused connections.
  Retrying them is what turns a block into a longer one.
- **Degrade, don't fail.** Optional sources such as Hardcover ratings and
  Wikidata enrichment already go through `optionalSource`, so a fast fail during
  a cooldown just omits them, with the shorter `DEGRADED_TTL_MS`.
  - For required sources (Open Library book, work and search), map the
    cooldown error to an HTTP 503 with a `Retry-After` header, so the app can
    show "Book data is temporarily unavailable, try again in N minutes"
    instead of a generic error.
  - Add that message to `ErrorState`'s copy for 503.
- **Path finder.** When Open Library is cooling down, end the search early with
  a new not-found reason, `upstreamUnavailable`, instead of spending the
  25 s budget on fast failures. Show that reason on the connection screen.
- **Logging.** Log once when a host enters a cooldown and once when it leaves
  one, not once per request. Today one block produces hundreds of log lines.
- **Deployment note (README).** Recommend setting `CACHE_DB_PATH` on a deployed
  server, so repeat lookups are served from disk instead of from Open Library.
  This caches only public API data, never user data. Also document the
  per-host limits.

**Tests** (fake timers, mocked `fetch`; no live calls):
- The rate per host is respected, and concurrency is capped.
- Two hosts don't block each other.
- A 429 with `Retry-After: 120` opens a 120 s cooldown. Calls during the
  cooldown fail fast without calling `fetch`. The first call after it reaches
  `fetch` again.
- A 503 with no `Retry-After` gets exponential backoff, capped.
- Repeated connection refusals open a cooldown.
- One-off 5xx and timeout blips are still retried as today.
- An optional source in cooldown is omitted with the degraded TTL. A required
  source returns 503 with `Retry-After`.
- The path finder returns `upstreamUnavailable` quickly when Open Library is
  cooling down.

**Order:** this task touches only the server's HTTP layer, so it doesn't depend
on tasks 1–3. Run it **first**, so later testing doesn't trigger another block.

---

## Order and review

4 → 1 → 2 → 3, each through implementer → task review → fixes, then one final
review across all four. Task 1 is the largest because it touches the storage
format, so its review should check the migration and the import of v1 backups
closely. No task or review may make live calls to Open Library, Wikidata or
Hardcover. Use mocks and fixtures only, and run any real-world check by hand
after Open Library unblocks the machine.

## Out of scope / not checked

- No book ↔ work note syncing. Each record keeps its own notes.
- No change to CSV export or the Goodreads/StoryGraph import format.
- Not verified on a device: the editor layout on the work page and the timing of
  the background fetch on slow networks.
