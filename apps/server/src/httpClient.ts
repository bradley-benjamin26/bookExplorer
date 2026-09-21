const DEFAULT_TIMEOUT_MS = 15_000;

// Retries only network-level failures (timeout, connection reset, DNS
// hiccup) and 5xx responses — both transient — never a 4xx, which is a real
// answer from the server (e.g. Open Library's own genuine 404 for an
// unrecognized ISBN) that retrying would never turn into anything
// different. Confirmed live: a request to Open Library's own primary
// lookup returned two consecutive 500s before a third, identical request
// succeeded — this app's client was only surviving that by luck, via
// React Query's own default retry; a transient blip like that should be
// absorbed here, once, for every source that goes through this function,
// rather than relying on every caller downstream to have its own retry
// policy (or not).
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 300;

function isRetryableStatus(status: number): boolean {
  return status >= 500;
}

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
function attemptOnce(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
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

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const isLastAttempt = attempt === MAX_ATTEMPTS - 1;
    try {
      const res = await attemptOnce(url, init, timeoutMs);
      // A successful response, a genuine client error (4xx), or the last
      // attempt's response either way — this is what the caller gets, same
      // as if this function had never retried at all.
      if (res.ok || !isRetryableStatus(res.status) || isLastAttempt) return res;
      lastError = new Error(`Request to ${url} failed with ${res.status}`);
    } catch (err) {
      if (isLastAttempt) throw err;
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * 2 ** attempt));
  }

  // Unreachable — the loop above always returns or throws on its last
  // attempt — but keeps this function's return type honest for TypeScript.
  throw lastError;
}
