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
Follow of an author is supported by the schema: `mutation { insert_follow(followable_type: "Author", followable_id: 123) { id error } }`. **`followable_type` value `"Author"` is a guess (not live-verified; scope-blocked).** Verify with a real token; Task 12 is feasible pending that.

## Step 1b: `user_books` privacy
`user_books` has `privacy_setting_id` (Int) (also `privacy_setting` relation). Live (works with this token): `books(where:{editions:{isbn_13:{_eq:"9780441013593"}}}, limit:1){ user_books(where:{privacy_setting_id:{_eq:1}, review_markdown:{_is_null:false}}, limit:2){ privacy_setting_id rating } }` returned two rows with `privacy_setting_id: 1`. **Public = 1**; add `privacy_setting_id: {_eq: 1}` to the existing QUERY's where clause. (Also saw private lists use `privacy_setting_id: 3` per plan; unverified.)

## Step 6: cleanup
No list was created (insert was rejected), so nothing to delete.
