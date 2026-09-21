/**
 * Tries `lookup` against each candidate ISBN in turn, stopping at the first
 * attempt whose result isn't considered empty. Shared by every ISBN-keyed
 * source (Hardcover, LOC) that a "work" page has to query this way: unlike
 * Open Library, which has its own edition listing for a work, these sources
 * only take a single ISBN, so any one of a work's several edition ISBNs
 * might be the one they actually have data for. A failed attempt is logged
 * and treated the same as an empty one, so one bad ISBN doesn't stop the
 * rest from being tried.
 */
export async function tryEachIsbn<T>(
  isbns: string[],
  lookup: (isbn: string) => Promise<T>,
  options: {
    sourceName: string;
    isEmpty: (result: T) => boolean;
    fallback: T;
    maxAttempts?: number;
  }
): Promise<T> {
  const { sourceName, isEmpty, fallback, maxAttempts = isbns.length } = options;
  for (const isbn of isbns.slice(0, maxAttempts)) {
    const result = await lookup(isbn).catch((err) => {
      console.warn(`[${sourceName}] Lookup failed for ISBN ${isbn}:`, err);
      return fallback;
    });
    if (!isEmpty(result)) return result;
  }
  return fallback;
}
