/**
 * Tries `lookup` against each candidate ISBN in turn, stopping at the first
 * attempt whose result isn't considered empty. Shared by every ISBN-keyed
 * source (Hardcover, LOC) that a "work" page has to query this way: unlike
 * Open Library, which has its own edition listing for a work, these sources
 * only take a single ISBN, so any one of a work's several edition ISBNs
 * might be the one they actually have data for. A failed attempt is logged
 * and the rest are still tried, so one bad ISBN doesn't stop the search —
 * but if nothing non-empty turns up and any attempt failed, the last error
 * is thrown rather than returning `fallback`: "found nothing" can't be
 * claimed when some candidates were never actually answered, and callers
 * use that distinction to avoid caching a transient outage as "no data."
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
  let lastError: unknown;
  let failed = false;
  for (const isbn of isbns.slice(0, maxAttempts)) {
    let result: T;
    try {
      result = await lookup(isbn);
    } catch (err) {
      console.warn(`[${sourceName}] Lookup failed for ISBN ${isbn}:`, err);
      failed = true;
      lastError = err;
      continue;
    }
    if (!isEmpty(result)) return result;
  }
  if (failed) throw lastError;
  return fallback;
}
