import { fetchWithTimeout } from "../httpClient.js";

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

export interface HardcoverReview {
  rating: number | null;
  text: string;
  hasSpoilers: boolean;
  reviewerName: string;
}

export interface HardcoverBookData {
  rating: number | null;
  ratingsCount: number;
  reviews: HardcoverReview[];
  coverUrl: string | null;
}

// Despite the field's name, `review_markdown` comes back as loose HTML
// (confirmed live: reviews riddled with `<br>` and non-breaking spaces) —
// this app has no markdown/HTML renderer, so tags are stripped and line
// breaks converted to plain newlines rather than showing up as literal
// "<br>" text in the middle of a review.
function normalizeReviewText(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Hardcover has no bare "book" lookup by ISBN — ISBNs live on `editions`,
// each pointing back to one shared `book` record, so the edition is what's
// queried and the book pulled off it. `user_books` is Hardcover's combined
// "this user's relationship to this book" record (shelf status, rating,
// review, ...) — only entries with review text are asked for here, and the
// API itself is documented to only ever return what each reviewer has
// marked public, so no privacy filtering is needed on this end.
const QUERY = `
  query BookByIsbn($isbn: String!) {
    editions(where: { _or: [{ isbn_13: { _eq: $isbn } }, { isbn_10: { _eq: $isbn } }] }, limit: 1) {
      book {
        rating
        ratings_count
        image {
          url
        }
        user_books(where: { review_markdown: { _is_null: false } }, order_by: { rating: desc }, limit: 5) {
          rating
          review_markdown
          review_has_spoilers
          user {
            username
          }
        }
      }
    }
  }
`;

interface HardcoverGraphQLResponse {
  data?: {
    editions?: {
      book?: {
        rating: number | null;
        ratings_count: number | null;
        image?: { url?: string | null } | null;
        user_books?: {
          rating: number | null;
          review_markdown: string | null;
          review_has_spoilers: boolean | null;
          user?: { username?: string | null } | null;
        }[];
      } | null;
    }[];
  };
  errors?: { message: string }[];
}

export async function lookupByIsbn(isbn: string): Promise<HardcoverBookData | null> {
  const authorization = authHeader();
  // No key configured: Hardcover is simply not consulted, same as Google
  // Books without GOOGLE_BOOKS_API_KEY — this is an optional data source,
  // not a required one.
  if (!authorization) return null;

  const res = await fetchWithTimeout(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authorization },
    body: JSON.stringify({ query: QUERY, variables: { isbn } }),
  });
  if (!res.ok) throw new Error(`Hardcover request failed: ${res.status}`);

  const body = (await res.json()) as HardcoverGraphQLResponse;
  if (body.errors?.length) {
    throw new Error(`Hardcover GraphQL error: ${body.errors.map((e) => e.message).join("; ")}`);
  }

  const book = body.data?.editions?.[0]?.book;
  if (!book) return null;

  const reviews = (book.user_books ?? []).flatMap((ub) =>
    ub.review_markdown
      ? [
          {
            rating: ub.rating ?? null,
            text: normalizeReviewText(ub.review_markdown),
            hasSpoilers: ub.review_has_spoilers ?? false,
            reviewerName: ub.user?.username ?? "A Hardcover reader",
          },
        ]
      : []
  );

  return {
    rating: book.rating ?? null,
    ratingsCount: book.ratings_count ?? 0,
    reviews,
    coverUrl: book.image?.url ?? null,
  };
}

/** Tries each candidate ISBN in turn until one resolves — a "work" has no
 * ISBN of its own, only its editions do, and any one edition's Hardcover
 * data is as usable as another's since Hardcover ratings/reviews are
 * recorded per book, not per edition. */
export async function lookupByAnyIsbn(isbns: string[]): Promise<HardcoverBookData | null> {
  for (const isbn of isbns) {
    const result = await lookupByIsbn(isbn).catch((err) => {
      console.warn(`[hardcover] Lookup failed for ISBN ${isbn}:`, err);
      return null;
    });
    if (result) return result;
  }
  return null;
}
