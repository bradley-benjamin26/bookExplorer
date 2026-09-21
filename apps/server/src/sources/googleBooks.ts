import { fetchWithTimeout } from "../httpClient.js";

export interface GoogleBooksResult {
  description: string | null;
  coverUrl: string | null;
  rating: { average: number; count: number } | null;
}

export async function lookupByIsbn(isbn: string): Promise<GoogleBooksResult | null> {
  // Unauthenticated requests share a small global quota across every app
  // that doesn't set a key — it's commonly exhausted (seen firsthand: a
  // 429 with quota_limit_value "0" for the rest of that day). An API key
  // gets its own per-project quota instead. Optional: falls back to the
  // shared pool if GOOGLE_BOOKS_API_KEY isn't set.
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}${
    apiKey ? `&key=${encodeURIComponent(apiKey)}` : ""
  }`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Google Books request failed: ${res.status}`);

  const body = (await res.json()) as {
    items?: {
      volumeInfo?: {
        description?: string;
        imageLinks?: { thumbnail?: string; smallThumbnail?: string };
        averageRating?: number;
        ratingsCount?: number;
      };
    }[];
  };
  const info = body.items?.[0]?.volumeInfo;
  if (!info) return null;

  const rawCoverUrl = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null;

  return {
    description: info.description ?? null,
    // Google Books always returns these as plain http://, never https://,
    // even though the same image is also served over https. Left as-is,
    // that image silently fails to load wherever plain HTTP is blocked —
    // mixed-content blocking on an HTTPS web page, iOS App Transport
    // Security, Android cleartext-traffic blocking on modern API levels —
    // which covers this app's production deployment and both native builds.
    coverUrl: rawCoverUrl ? rawCoverUrl.replace(/^http:\/\//, "https://") : null,
    rating: info.averageRating && info.ratingsCount ? { average: info.averageRating, count: info.ratingsCount } : null,
  };
}
