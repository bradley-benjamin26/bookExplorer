# Open Library auth and lists API shapes (spike, 2026-11-12)

Recorded against openlibrary.org with a real account, `User-Agent: BookExplorer/0.1`. Keys and cookie values are removed. The spike list was deleted afterwards.

## 1. Login

- `POST /account/login` and `POST /account/login.json` both work. Use `/account/login`.
- Request: `Content-Type: application/json`, body `{"access": "<S3 access>", "secret": "<S3 secret>"}`.
- Success: **HTTP 200**, empty body, and these cookies:
  - `Set-Cookie: session=<value>; Path=/; SameSite=Lax`. No `Expires` or `Max-Age`, so it's a browser-session cookie with a server-side lifetime we can't see.
  - Also `s3=<Fernet token>; HttpOnly; Secure`, `pd=`, `sfw=`. **Writes work with the `session` cookie alone**, so only `session` is kept.
- Wrong keys: **HTTP 400**, body `{"error": "invalid_s3keys", "errorDisplayString": "Login attempted with invalid Internet Archive s3 credentials."}`.
- Missing `secret`: **HTTP 400**, body `'username'`.
- Real S3 keys: **16 characters, `[A-Za-z0-9]`**, for both access and secret. The plan's `/^[A-Za-z0-9]{8,64}$/` covers this.

## 2. Username

The `session` value is **not quoted**. Shape: `/people/<username>%2C<timestamp>%2C<hash>`, with `%2C`-encoded commas (3 parts: username path, then 23 and 40 chars). Username = `decodeURIComponent(value)` → `^/people/([^,]+),`. Usernames can contain `_` (e.g. `benjamin_thomas_bradley`). Strip surrounding quotes defensively.

## 3. Create a list

- `POST /people/<u>/lists` → **405** `method not allowed`.
- `POST /people/<u>/lists.json` with `{"name":"…","description":"","seeds":[]}` and the cookie → **200** `{"key": "/people/<u>/lists/OL357393L", "revision": 1}`. The id is the trailing `OL…L` of `key` in the body. No `Location` header.

## 4. Add and remove seeds

- `POST /people/<u>/lists/<id>/seeds.json`, with the cookie:
  - add: `{"add": [{"key": "/works/OL45804W"}, {"key": "/books/OL7353617M"}, {"key": "/authors/OL23919A"}]}` → **200** `{"key": "…", "revision": N}`
  - remove: `{"remove": ["/works/OL45804W"]}` (plain strings) → **200**
  - **50 adds in one call work** (`seed_count` went from 2 to 52).
- The `/list/` spelling wasn't needed.
- **Hazard:** after adding 50 sequential work ids (`/works/OL45805W`…`OL45854W`, all 200 on `/works/X.json`), every `seeds.json` read returned **500 Internal Server Error** until they were removed. Some seed kinds (probably redirect or deleted works) break list reads. So only add seeds the server got from a lookup, and treat a 500 on read as an upstream error (sync must not prune on it).

## 5. Reading

- `GET /people/<u>/lists.json` → `{"links": {"self": "/people/<u>"}, "size": N, "entries": [{"url": "/people/<u>/lists/OL357393L", "full_url": "…", "name": "…", "seed_count": 52, "last_update": "…"}]}`. No paging seen.
- `GET /people/<u>/lists/<id>.json` → `{"name": "…", "description": null, "seed_count": 52, "links": {...}, "meta": {...}}`. **`description` can be `null`**, so map it to `""`.
- `GET /people/<u>/lists/<id>/seeds.json` → `{"links": {"self": "…/seeds", "list": "…"}, "size": 52, "entries": [{"url": "/works/OL45804W", "full_url": "…", "type": "work" | "edition" | "author", "title": "Fantastic Mr Fox", "last_update": "…", "picture": {...}}]}`.
  - Every entry has a `title`.
  - **All 52 seeds came back in one response, with no `links.next`.** `?limit=10`, `?limit=1000` and `?offset=10` were all ignored. Keep following `links.next` if it ever appears, under the 2,000 cap.
- Reads need no cookie.

## 6. Rejected cookie

A seed write with a tampered `session` value, or with no cookie at all → **HTTP 401** `{"detail": "Authentication required"}`. No redirect.

## 7. Rate limit

60 `lists.json` reads in about a minute: all 200, no 429, no `Retry-After`. Keep the 429 handling (`Retry-After`, default 60s) as a safety net.

## 8. Delete

`POST /people/<u>/lists/<id>/delete.json` with the cookie → **200** `{"status": "ok"}`. The list then returns 404, and `lists.json` shows `size: 0`.

## ISBN → edition (affects `seedFor`)

- `GET /isbn/<isbn>.json` never 404s for the ISBNs tried. It **302s to `/books/OL…M.json`**, including for junk ISBNs such as 9780000000002 (Open Library holds junk import records for those), so it can't tell us "missing". It's also documented to attempt imports on a miss. Not used.
- `GET /api/volumes/brief/isbn/<isbn>.json` (already used in `sources/openLibrary.ts`) is read-only:
  - hit → `{"records": {"/books/OL7353617M": {"data": {"key": "/books/OL7353617M", …}, "olids": ["OL7353617M"], …}}, "items": [...]}`. The seed is the first `records` key.
  - miss → `[]` (an empty JSON **array**). Treat an empty or absent `records` as missing.
- `GET /books/OL7353617M.json` → includes `isbn_13: ["9780140328721"]`, `isbn_10: ["0140328726"]`.
