# Hardcover API shapes (spike, 2026-11-01)

Endpoint `POST https://api.hardcover.app/v1/graphql`, header `Authorization: Bearer <token>`. Tokens removed from everything below.

## Blocker: the owner's PAT in `apps/server/.env` is scope-limited
It authenticates and can read public data, but:
- `{ me { id username } }` -> HTTP 403, header `www-authenticate: Bearer realm="hardcover", error="insufficient_scope", scope="read:me"`, body `{"error":"insufficient_scope","error_description":"Missing scopes: read:me","scope":"read:me"}`
- `mutation { insert_list(...) }` -> HTTP 403, `scope="write:lists"`, body `{"error":"insufficient_scope","error_description":"Missing scopes: write:lists","scope":"write:lists"}`

So Steps 1-3 and the follow mutation could NOT be run live. **OAuth scopes needed: `read:me`, `write:lists` (names as the API reports them; follow scope unknown, likely a `write:` one).** Introspection and public reads work without them. Steps 1-3, 5 (live) must be re-run with a real OAuth user token (or a PAT with those scopes).

## Step 1: `me`
Live: blocked (scope). Introspection of `query_root.me`: `NON_NULL<LIST<NON_NULL<users>>>` -> **an array; read `[0]`**. The plan's assumption holds.

## Step 2: `insert_list`
Live: blocked. Introspection: `insert_list(object: ListInput!) -> ListIdType`, `ListIdType { errors, id, list }`. `ListInput { default_view, description, featured_profile, name, privacy_setting_id: Int, ranked, url }`. So `insert_list(object: {...}) { id }` is the right shape (no `affected_rows/returning`); select `errors` too. `delete_list(id: Int!) -> ListDeleteType`.

## Step 3: `insert_list_book` position
Live: blocked. Introspection: `insert_list_book(object: ListBookInput!) -> ListBookIdType { id, list_book }`; `ListBookInput { book_id: Int!, edition_id: Int, list_id: Int!, position: Int }`. **`position` is nullable (optional) in the schema**; where it lands when omitted is unverified.

## Step 4: error shapes (live)
- Bad token: HTTP **401**, `www-authenticate: Bearer realm="hardcover", error="invalid_token", error_description="Token is not associated with a user"`, body `{"error":"invalid_token","error_description":"Token is not associated with a user"}`.
- Valid token, missing scope: HTTP **403** (above), body is a top-level `{error, error_description, scope}` (not a GraphQL `errors` array).
- Rate limit: policy header `ratelimit-policy: "Free";q=60;w=60;burst=10, "daily";q=5000;w=86400`. Sequential requests hit **429** after about 10 (the burst limit, not 60): HTTP **429**, `retry-after: 1`, `ratelimit: "Free";r=0;t=1,...`, body `{"error":"Too Many Requests","message":"API rate limit exceeded for tier 'Free'. Try again in 1 seconds."}`. Recovers within ~1s. Also `x-ratelimit-limit: 10`, `x-ratelimit-remaining`, `x-ratelimit-daily-remaining`. Note 403 responses also count toward the limit.

## Step 5: author follow
Introspection: `follows { author, book, character, created_at, edition, followable_id, followable_type, id, list, publisher, series, updated_at, user, user_id }`.
`insert_follow(followable_id: Int!, followable_type: String!) -> FollowType { error, follow, followable_id, followable_type, id }`; `delete_follow(followable_id: Int!, followable_type: String!) -> FollowDeleteType { error, success }`.
**Conclusion: BUILD Task 12** (controller ruling).
Follow of an author is supported by the schema: `mutation { insert_follow(followable_type: "Author", followable_id: 123) { id error } }`. **`followable_type` value `"Author"` is a guess (not live-verified; scope-blocked).** The scope insert_follow needs is not shown by introspection and not documented anywhere I could reach; the plan adds `write:social` (unverified). Owner must confirm both `"Author"` and `write:social` with a real OAuth token.

## Step 1b: `user_books` privacy
`user_books` has `privacy_setting_id` (Int) plus a `privacy_setting` relation. The lookup table is readable with the PAT: `{ privacy_settings { id setting } }` returned `1 = Public`, `2 = Followers only`, `3 = Private`. So **public = 1** (confirmed), and private lists use `privacy_setting_id: 3` (confirmed as "Private"). Live check: `books(where:{editions:{isbn_13:{_eq:"9780441013593"}}}, limit:1){ user_books(where:{privacy_setting_id:{_eq:1}, review_markdown:{_is_null:false}}, limit:2){ privacy_setting_id rating } }` returned two rows with `privacy_setting_id: 1`. Add `privacy_setting_id: {_eq: 1}` to the existing QUERY's where clause.

## Step 6: cleanup
No list was created (insert was rejected), so nothing to delete.

## Scope names (finding 4)
docs.hardcover.app blocks curl/WebFetch (Cloudflare 403), so the docs pages were NOT read directly; the below is from search-result excerpts of the official "Actions & Scopes" page (docs.hardcover.app/api/graphql/actions/) plus live 403s.
- Confirmed to exist: `read:me` (live 403 for `me`), `write:lists` (live 403 for `insert_list`), `read:me:content`, `read:me:email`, `read:me:roles`, `read:lists`, `read:lists:following`, `read:lists:private`, `read:lists:public`. The `me` query accepts any one of `read:me`, `read:me:content`, `read:me:email`, `read:me:roles`, so the plan's `read:me:content` should satisfy `me` (the 403 just names `read:me`, the first alternative). Docs say a token needs at least one listed scope per action.
- Seen only in third-party sources: `write:library` (user_book / reading-journal mutations, per a community project).
- Not confirmed anywhere: `read:catalog`, `read:library`, `write:social` (plan constant). Hardcover's PAT link builder says unknown scopes are silently dropped, so a wrong name fails quietly. Possibly `read:library` should be `read:me:content` or a `read:` library scope; owner must check the OAuth app's scope list in Hardcover settings.
- Mapping needed by the plan: me = `read:me` or `read:me:content`; read/create lists = `read:lists` / `write:lists`; list books (insert_list_book) = probably `write:lists` (unverified); user_books / reading progress = `read:me:content` for reads, `write:library` for writes (unverified); follow = `write:social` (unverified guess).
- Plan constant `read:me:content read:catalog read:lists write:lists read:library`: names to flag as unverified are `read:catalog`, `read:library`; `write:library` and `write:social` are missing/unconfirmed.

## Assumptions for later tasks (re-verify at the first real OAuth sign-in, owner's manual check)
Steps 1-3 were not live-verified (PAT lacks scopes). Later tasks assume exactly:
1. `me` is an array, read `[0]`:
```graphql
{ me { id username } }
```
 -> `data.me[0].id`.
2. Create a private list, selecting `id`:
```graphql
mutation { insert_list(object: { name: "ShelfThread spike", description: "spike", privacy_setting_id: 3 }) { id } }
```
 (`3` = Private, confirmed above.) Fallback if rejected: `{ errors list { id } }` (ListIdType has `errors`, `id`, `list`). Cleanup: `mutation { delete_list(id: 123) { success } }` (ListDeleteType fields not introspected; check).
3. Add a book without `position`:
```graphql
mutation { insert_list_book(object: { list_id: 123, book_id: 456 }) { id } }
```
 If the API demands `position`, pass `books_count + 1`.
4. Follow an author:
```graphql
mutation { insert_follow(followable_type: "Author", followable_id: 789) { id error } }
```
The first real OAuth sign-in must confirm each of 1-4 (and the scopes above).
