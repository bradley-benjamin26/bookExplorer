import { UpstreamUnavailableError, fetchWithTimeout } from "../httpClient.js";
import { tryEachIsbn } from "../isbnFallback.js";

const ENDPOINT = "https://api.hardcover.app/v1/graphql";

// The token from Hardcover's account settings page is copied out already
// prefixed with "Bearer " — but that's not obvious, and a key pasted
// without it (or with it stripped by some other tool along the way) should
// still work rather than silently failing every request, so both forms are
// accepted here.
function authHeader(): string | null {
  const key = process.env.HARDCOVER_API_KEY;
  if (!key) return null;
  return key.startsWith("Bearer ") ? key : `Bearer ${key}`;
}

export class HardcoverUnavailableError extends Error {
  constructor(readonly status: number) {
    super(`Hardcover request failed: ${status}`);
    this.name = "HardcoverUnavailableError";
  }
}

export class HardcoverRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(`Hardcover rate limit hit; retry in ${retryAfterSeconds}s`);
    this.name = "HardcoverRateLimitError";
  }
}

export class HardcoverUnauthorizedError extends Error {
  constructor() {
    super("Hardcover rejected the token");
    this.name = "HardcoverUnauthorizedError";
  }
}

/** One authenticated GraphQL call; the caller picks whose token it runs on. */
export async function hardcoverGraphql<T>(query: string, variables: object, authorization: string, opts: { retry?: boolean } = {}): Promise<T> {
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authorization },
    body: JSON.stringify({ query, variables }),
  };
  let res: Response;
  try {
    // retry: false uses plain fetch, as hardcoverOAuth's token calls do: fetchWithTimeout retries 5xx and timeouts, which would repeat a mutation.
    // A user's token has its own Hardcover limit; its 429 must not pause the host for everyone.
    res = opts.retry === false || authorization !== authHeader() ? await fetch(ENDPOINT, { ...init, signal: AbortSignal.timeout(10_000) }) : await fetchWithTimeout(ENDPOINT, init);
  } catch (err) {
    // fetchWithTimeout turns 429/503 into this before we see the response.
    if (err instanceof UpstreamUnavailableError) throw new HardcoverRateLimitError(Math.max(1, Math.ceil(err.retryAfterMs / 1000)));
    throw err;
  }
  if (res.status === 429) {
    const secs = Number(res.headers.get("Retry-After"));
    throw new HardcoverRateLimitError(secs > 0 ? secs : 60);
  }
  if (res.status === 401) throw new HardcoverUnauthorizedError();
  if (res.status === 403) {
    // Not a GraphQL errors array: {error, error_description, scope}.
    const body = (await res.json().catch(() => ({}))) as { scope?: string };
    throw new Error(`Hardcover token lacks scope${body.scope ? ` "${body.scope}"` : ""}`);
  }
  if (res.status >= 500) throw new HardcoverUnavailableError(res.status);
  if (!res.ok) throw new Error(`Hardcover request failed: ${res.status}`);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(`Hardcover GraphQL error: ${body.errors.map((e) => e.message).join("; ")}`);
  return body.data as T;
}

export interface HardcoverBookData {
  rating: number | null;
  ratingsCount: number;
  coverUrl: string | null;
  slug: string | null;
}

// Hardcover has no bare "book" lookup by ISBN — ISBNs live on `editions`,
// each pointing back to one shared `book` record, so the edition is what's
// queried and the book pulled off it.
const QUERY = `
  query BookByIsbn($isbn: String!) {
    editions(where: { _or: [{ isbn_13: { _eq: $isbn } }, { isbn_10: { _eq: $isbn } }] }, limit: 1) {
      book {
        slug
        rating
        ratings_count
        image {
          url
        }
      }
    }
  }
`;

interface HardcoverData {
  editions?: {
    book?: {
      slug?: string | null;
      rating: number | null;
      ratings_count: number | null;
      image?: { url?: string | null } | null;
    } | null;
  }[];
}

export async function lookupByIsbn(isbn: string, authorization?: string | null): Promise<HardcoverBookData | null> {
  const auth = authorization ?? authHeader();
  // No key configured: Hardcover is simply not consulted, same as Google
  // Books without GOOGLE_BOOKS_API_KEY — this is an optional data source,
  // not a required one.
  if (!auth) return null;

  const data = await hardcoverGraphql<HardcoverData>(QUERY, { isbn }, auth);
  const book = data?.editions?.[0]?.book;
  if (!book) return null;

  return {
    rating: book.rating ?? null,
    ratingsCount: book.ratings_count ?? 0,
    coverUrl: book.image?.url ?? null,
    slug: book.slug ?? null,
  };
}

/** Tries each candidate ISBN in turn until one resolves — a "work" has no
 * ISBN of its own, only its editions do, and any one edition's Hardcover
 * data is as usable as another's since Hardcover ratings are
 * recorded per book, not per edition. */
export function lookupByAnyIsbn(isbns: string[], authorization?: string | null): Promise<HardcoverBookData | null> {
  // Hardcover's 60 requests a minute are shared by every page; cap the tries.
  return tryEachIsbn(isbns, (isbn) => lookupByIsbn(isbn, authorization), { sourceName: "hardcover", isEmpty: (result) => !result, fallback: null, maxAttempts: 5 });
}
