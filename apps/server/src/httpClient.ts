const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * A plain `fetch()` has no timeout at all — if an upstream (Open Library,
 * Google Books, Wikidata) stalls instead of erroring, the request just hangs
 * forever with no way for the caller to recover, and the client is left
 * spinning indefinitely with no feedback.
 *
 * This was reproduced live twice: once as a slow-but-real Wikidata SPARQL
 * query, and once as an Open Library connection that stalled for over 15
 * minutes. The first pass at this used only `signal: AbortSignal.timeout()`,
 * which turned out not to be sufficient by itself — that second live case
 * kept the request outstanding for ~15.5 minutes despite a 15s timeout, i.e.
 * the abort didn't unstick the underlying stalled connection promptly. The
 * `Promise.race` below is an independent backstop: even if `abort()` doesn't
 * cut the connection in time, this function still returns control to its
 * caller on schedule, leaving at worst one abandoned socket in the
 * background rather than a request that never resolves at all.
 */
export function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Request to ${url} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([fetch(url, { ...init, signal: controller.signal }), timeoutPromise]).finally(() =>
    clearTimeout(timer)
  );
}
