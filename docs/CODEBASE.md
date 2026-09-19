# Codebase Guide

A file-by-file reference for the Book Explorer monorepo. See the root [package.json](../package.json) for the workspace scripts that tie these together.

## Repo layout

```
bookExplorer/
  apps/
    app/          Expo app — the mobile + web client
    server/       Fastify backend — aggregates external book/author data
  packages/
    shared/       TypeScript types shared between app and server
```

The client never calls Open Library, Google Books, or (later) Wikidata directly — it only talks to `apps/server`, which does the aggregation and caching. This keeps API keys and rate-limit-sensitive calls off the client and avoids CORS issues on web.

---

## Root

| File | Purpose |
|---|---|
| [package.json](../package.json) | Declares the npm workspaces (`apps/*`, `packages/*`) and top-level convenience scripts: `npm run dev:server`, `npm run dev:app`, `npm run build:shared`. |
| [.gitignore](../.gitignore) | Ignores `node_modules/`, build output, and Expo's local cache across all workspaces. |

---

## `packages/shared` — shared types

The single source of truth for data shapes used by both the server (producing them) and the app (consuming them). No build step yet — both TypeScript (server, via `tsx`) and Metro (app) read the `.ts` source directly.

| File | Purpose |
|---|---|
| [package.json](../packages/shared/package.json) | Package manifest for `@book-explorer/shared`. `main`/`types` point straight at `src/index.ts` (raw TS, no compiled `dist/`). |
| [src/index.ts](../packages/shared/src/index.ts) | Defines `Book`, `AuthorRef`, `Author`, `AuthorRelation`, `WorkRef`, `Work`, `SubjectConcept`, `Subject`, `GraphNode`, `GraphEdge`, and `Graph`, each as a [zod](https://zod.dev) schema with an inferred TypeScript type, plus the `slugifySubject(name)` helper. `AuthorRelation.relation` is one of `"influencedBy" \| "influenced" \| "notableWork" \| "movement"`. `WorkRef`/`Work` represent an Open Library **work** (an abstract book, e.g. "Pride and Prejudice") as distinct from `Book`, which always represents one scanned **edition** with an ISBN — subject listings return works, not ISBNs, so the two can't share a shape. `SubjectConcept.relation` is `"broader" \| "narrower"`. `slugifySubject` reproduces Open Library's subject URL slugging (lowercase, spaces → underscores) so the app can build a `/subject/[slug]` link from any raw subject string. `GraphNode`/`GraphEdge`/`Graph` still aren't consumed by anything — they're the shape the Phase 4 graph explorer will use. |

---

## `apps/server` — Fastify backend

A thin aggregation layer: it fetches from external book APIs, normalizes the result into the shared `Book` type, and caches responses so repeated lookups (and, later, rate-limited Wikidata SPARQL queries) don't re-hit the network every time.

| File | Purpose |
|---|---|
| [package.json](../apps/server/package.json) | Server manifest. Runs on `tsx watch` for dev (no separate compile step); depends on `fastify`, `@fastify/cors`, and the local `@book-explorer/shared` package. |
| [tsconfig.json](../apps/server/tsconfig.json) | Node-targeted TS config (`NodeNext` module resolution, ES2022 target, strict mode). |
| [src/index.ts](../apps/server/src/index.ts) | Server entry point. Creates the Fastify instance, registers CORS (open, since this is a local aggregation API) and the `booksRoutes` plugin, exposes `GET /health`, and starts listening on `PORT` (default `3001`). |
| [src/cache.ts](../apps/server/src/cache.ts) | `TtlCache<T>` — a minimal in-memory cache with a time-to-live per entry. `.wrap(key, fetcher)` returns the cached value if present and not expired, otherwise calls `fetcher()`, caches, and returns it. Used to avoid re-fetching the same ISBN (and, later, the same Wikidata query) on every request. |
| [src/routes/books.ts](../apps/server/src/routes/books.ts) | Registers `GET /api/books/isbn/:isbn`. Looks up the ISBN via `openLibrary.lookupByIsbn`, and — only if the cover or description is missing — fills the gap from `googleBooks.lookupByIsbn`. Results are cached per-ISBN for an hour. Returns 404 with an error body if Open Library has no record at all. |
| [src/routes/authors.ts](../apps/server/src/routes/authors.ts) | Registers `GET /api/authors/:openLibraryId`. Fetches the Open Library author record, resolves it to a Wikidata QID (from `remote_ids.wikidata`, or a name-search fallback), pulls that author's relations from Wikidata, and assembles the shared `Author` shape. Results are cached per author for 24 hours — much longer than book lookups — since Wikidata's SPARQL endpoint is rate-limited and this data rarely changes. If there's no Wikidata match at all, it still returns the Open Library bio/dates with an empty `relations` array rather than failing. |
| [src/routes/subjects.ts](../apps/server/src/routes/subjects.ts) | Registers `GET /api/subjects/:slug`. Fetches the Open Library subject listing (its books), tries to resolve the subject name to a Wikidata concept, and pulls that concept's broader/narrower topics. Cached 24 hours per slug, same rationale as authors. If Open Library has no such subject at all, returns 404; if Open Library has it but Wikidata has no confident match, still returns the books with `wikidataId: null` and an empty `relatedConcepts` array. |
| [src/routes/works.ts](../apps/server/src/routes/works.ts) | Registers `GET /api/works/:workId`. Thin wrapper around `openLibrary.getWork`, cached an hour per work id. Exists because subject listings and the book screen both need to link to a work by id without an ISBN in hand. |
| [src/sources/openLibrary.ts](../apps/server/src/sources/openLibrary.ts) | Open Library client. `lookupByIsbn` calls the Read API's `GET /api/volumes/brief/isbn/:isbn.json` endpoint (the older `/api/books?bibkeys=...` endpoint was retired — see the comment in this file) and maps the response into `{ title, authors, subjects, coverUrl, description }`; `extractAuthorId` pulls the `OL...A` author ID out of the author profile URL. `getAuthor` calls `GET /authors/:id.json` for an individual author's name, bio, birth/death dates, and `remote_ids.wikidata`. `getWork` calls `GET /works/:id.json` for a work's title, description, subjects, and cover; since that endpoint only references authors by id (`{author: {key: "/authors/OL..."}}`), it resolves each author's name with `getAuthor`. `getSubject` calls `GET /subjects/:slug.json` for a subject's work list (title/authors/cover per work — no ISBN, since subjects list works, not editions). Also exports the shared `USER_AGENT` string, reused by `wikidata.ts`. |
| [src/sources/googleBooks.ts](../apps/server/src/sources/googleBooks.ts) | Google Books client, used only as a fallback for `description`/`coverUrl` when Open Library doesn't have them. Calls the public `volumes` search endpoint with `q=isbn:{isbn}`. |
| [src/sources/wikidata.ts](../apps/server/src/sources/wikidata.ts) | Wikidata client. `searchAuthorQid(name)` is the fallback path when Open Library has no Wikidata link: it calls `wbsearchentities` and picks the first candidate whose description contains a writer-ish keyword (`writer`, `author`, `novelist`, ...), falling back to the top result. `searchConceptQid(name)` does the same for subject strings, but the other way round — it *rejects* candidates whose description marks them as a specific film/album/episode/edition/etc rather than a general concept (Open Library subjects are messy compound topic strings, e.g. `"Fiction, Romance, Historical, Regency"`, so a plain top-result match frequently landed on things like a 1919 short-story collection titled "Love Stories" instead of the concept of a love story), and returns `null` rather than guess if every candidate is rejected — a missing match is preferable to a wrong one. Both `fetchAuthorRelations(qid)` and `fetchRelatedConcepts(qid)` build a SPARQL `UNION` query (P737/P800/P135 for authors; P279 and its inverse for concepts) and run it through the shared `runRelationQuery` helper, which also collapses duplicate `(relation, QID)` rows — Wikidata items commonly carry more than one Open Library ID (P648), which would otherwise produce repeated rows. `UNION` rather than several `OPTIONAL` blocks avoids a cross-product blowup when an entity has many values for more than one property. |

---

## `apps/app` — Expo client (mobile + web)

One Expo Router codebase. `npx expo start` serves native (iOS/Android via simulator or Expo Go) and `--web` serves a browser build via `react-native-web` — there's no separate web app.

| File | Purpose |
|---|---|
| [package.json](../apps/app/package.json) | App manifest. `main` is `expo-router/entry` (Expo Router owns the app's entry point instead of a hand-written `App.tsx`). Depends on `expo-router`, `expo-camera`, `@tanstack/react-query`, `@react-native-async-storage/async-storage`, and the local `@book-explorer/shared` package. |
| [app.json](../apps/app/app.json) | Expo config: app name/slug, deep-link `scheme` (`bookexplorer`), `experiments.typedRoutes` (generates TypeScript types for route paths), iOS `NSCameraUsageDescription` and Android `CAMERA` permission text, and the `expo-camera` config plugin (which injects the platform-specific camera permission strings at build time). |
| [tsconfig.json](../apps/app/tsconfig.json) | Extends Expo's base TS config with `strict: true`. |
| [metro.config.js](../apps/app/metro.config.js) | Extends Expo's default Metro config so the bundler can see outside `apps/app` — `watchFolders` includes the monorepo root and `resolver.nodeModulesPaths` includes the root `node_modules`, which is what lets Metro resolve the workspace-linked `@book-explorer/shared` package. Without this, Metro would only look inside `apps/app` and fail to find it. |
| [expo-env.d.ts](../apps/app/expo-env.d.ts) | Auto-generated by Expo; provides ambient types for Expo's environment. Not hand-edited. |
| [AGENTS.md](../apps/app/AGENTS.md) / [CLAUDE.md](../apps/app/CLAUDE.md) | Shipped by the official Expo template, not written for this project specifically. They tell AI coding assistants to check the version-pinned Expo docs (`docs.expo.dev/versions/v57.0.0/`) before writing Expo code, since the SDK moves fast. `.claude/settings.json` alongside them enables Expo's official Claude Code plugin. |
| **`app/` — Expo Router routes** (file path = URL/screen path) | |
| [app/_layout.tsx](../apps/app/app/_layout.tsx) | Root layout, wraps every screen. Sets up the `QueryClientProvider` (React Query) used by every detail screen's data fetching, and declares the `Stack` navigator with six screens: `index`, `scan` (presented as a modal), `book/[isbn]`, `author/[id]`, `subject/[slug]`, and `work/[id]`. |
| [app/index.tsx](../apps/app/app/index.tsx) | Home screen. Manual ISBN text entry, a "Scan Barcode" button (routes to `/scan`), and a "Recent" list read from on-device storage (`getRecentIsbns`) that refreshes via `useFocusEffect` whenever the screen regains focus. |
| [app/scan.tsx](../apps/app/app/scan.tsx) | Camera screen. Uses `expo-camera`'s `CameraView` with `barcodeScannerSettings` restricted to book-barcode formats (`ean13`, `ean8`, `upc_a`, `upc_e`). Handles the not-yet-granted permission state with a "Grant Permission" button. On a successful scan, navigates to `/book/[isbn]` with the decoded barcode value and uses a ref (`hasScanned`) to make sure a single scan doesn't fire the navigation twice. |
| [app/book/[isbn].tsx](../apps/app/app/book/%5Bisbn%5D.tsx) | Book detail screen. Reads the `isbn` route param, fetches it via React Query (`fetchBookByIsbn`), and renders cover/title/authors/description/subjects. Each author name links to `/author/[openLibraryId]`; each subject tag links to `/subject/[slug]` (via `slugifySubject`). Records the ISBN into recent history (`addRecentIsbn`) once the fetch succeeds. Shows a spinner while loading and an error message (from the server's error body, if present) on failure. |
| [app/author/[id].tsx](../apps/app/app/author/%5Bid%5D.tsx) | Author detail screen. Reads the `id` (Open Library author ID) route param, fetches it via `fetchAuthor`, and renders name/dates/bio, then one section per relation type (Influenced by, Influenced, Notable Works, Literary Movement), skipping empty sections. Only `influencedBy`/`influenced` entries that carry an `openLibraryId` are tappable — they push a new `/author/[id]` route, so you can drill from author to author. If Open Library had no Wikidata match, shows a note instead of failing outright. |
| [app/subject/[slug].tsx](../apps/app/app/subject/%5Bslug%5D.tsx) | Subject detail screen. Reads the `slug` route param, fetches it via `fetchSubject`, and renders the subject name/work count, then "Broader topics"/"Narrower topics" chip rows (built from `relatedConcepts`, tappable — each re-slugifies the concept's Wikidata label and navigates to *that* `/subject/[slug]`, which may or may not exist on Open Library; the 404 state handles a miss), then the list of related books, each tappable into `/work/[openLibraryWorkId]`. Renders as a `FlatList` (books in the list, everything else in `ListHeaderComponent`) rather than a `ScrollView`, since the book list can run to dozens of entries. |
| [app/work/[id].tsx](../apps/app/app/work/%5Bid%5D.tsx) | Work detail screen — effectively `book/[isbn].tsx`'s counterpart for a work with no specific ISBN in hand (the case when arriving from a subject listing). Reads the `id` (Open Library work ID) route param, fetches it via `fetchWork`, and renders cover/title/authors (linking to `/author/[id]`)/description/subjects (linking to `/subject/[slug]`) — this is what closes the loop back from "related book" to "its own subjects," so you can keep walking book → subject → book → subject. |
| **`src/` — non-route application code** | |
| [src/api/client.ts](../apps/app/src/api/client.ts) | Typed fetch wrapper around the server. `resolveApiBaseUrl()` picks the right host automatically: `localhost:3001` on web, or — on a physical device/simulator — the same LAN IP Metro is already running on (read from `Constants.expoConfig.hostUri`), so you don't have to hardcode your machine's IP. `getJson` is the shared request/error-handling helper behind `fetchBookByIsbn`, `fetchAuthor`, `fetchSubject`, and `fetchWork`; failures throw `ApiError`, which carries the HTTP status. |
| [src/storage/history.ts](../apps/app/src/storage/history.ts) | On-device "recently viewed" list backed by `AsyncStorage`. `getRecentIsbns()` reads it, `addRecentIsbn()` prepends a new ISBN (de-duplicating) and caps the list at 20 entries. Purely local — nothing here is sent to the server. |
| `assets/` | App icon, splash icon, and Android adaptive-icon layers referenced from `app.json`. Placeholder images from the Expo template — swap these out before shipping. |

---

## What's not built yet

Phases 4–5 of the original plan are still ahead: the interactive force-directed graph explorer (`react-native-svg` + `d3-force`) tying books/authors/subjects into one visual map, and general polish (SQLite-backed caching if needed, styling, error states). The `GraphNode`/`GraphEdge`/`Graph` types in `packages/shared` already exist in anticipation of that work but have no producer or consumer yet.
