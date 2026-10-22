const DEFAULT_TIMEOUT_MS = 15_000;

// Retries only network-level failures (timeout, connection reset, DNS
// hiccup) and 5xx responses — both transient — never a 4xx, which is a real
// answer from the server (e.g. Open Library's own genuine 404 for an
// unrecognized ISBN) that retrying would never turn into anything
// different. A 429/503 or a refused connection is not retried at all: it
// means the host is throttling or blocking us, and retrying makes that worse
// (see the per-host cooldown below).
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 300;

// Requests per second and simultaneous requests allowed to one upstream host,
// shared by every caller in this server process. Callers queue, never fail.
const DEFAULT_HOST_LIMIT = { perSecond: 10, concurrent: 6 };
const HOST_LIMITS: Record<string, { perSecond: number; concurrent: number }> = {
  "openlibrary.org": { perSecond: 3, concurrent: 4 },
  "api.hardcover.app": { perSecond: 1, concurrent: 2 },
  "www.wikidata.org": { perSecond: 5, concurrent: 4 },
  "query.wikidata.org": { perSecond: 5, concurrent: 4 },
};

// A host that answers 429/503 (or fails to connect this many times in a row)
// is left alone: first for its Retry-After, else 30 s doubling up to 10 min.
const COOLDOWN_BASE_MS = 30_000;
const COOLDOWN_MAX_MS = 10 * 60_000;
const NETWORK_FAILURES_BEFORE_COOLDOWN = 3;

/** Thrown, without calling the host, while it is in a cooldown. */
export class UpstreamUnavailableError extends Error {
  constructor(readonly host: string, readonly retryAfterMs: number) {
    super(`${host} is temporarily unavailable; retry in ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = "UpstreamUnavailableError";
  }
}

type HostState = {
  active: number;
  waiters: Array<() => void>;
  nextSlot: number;
  cooldownUntil: number;
  cooling: boolean;
  backoffMs: number;
  networkFailures: number;
};

const hosts = new Map<string, HostState>();

/** Test hook: forget every host's limiter and cooldown state. */
export function resetUpstreamState() {
  hosts.clear();
}

function hostState(host: string): HostState {
  let st = hosts.get(host);
  if (!st) {
    st = { active: 0, waiters: [], nextSlot: 0, cooldownUntil: 0, cooling: false, backoffMs: 0, networkFailures: 0 };
    hosts.set(host, st);
  }
  return st;
}

function checkCooldown(host: string, st: HostState) {
  const left = st.cooldownUntil - Date.now();
  if (left > 0) throw new UpstreamUnavailableError(host, left);
}

function openCooldown(host: string, st: HostState, retryAfterMs?: number) {
  let ms = retryAfterMs;
  if (ms === undefined) {
    st.backoffMs = Math.min(st.backoffMs ? st.backoffMs * 2 : COOLDOWN_BASE_MS, COOLDOWN_MAX_MS);
    ms = st.backoffMs;
  }
  st.cooldownUntil = Math.max(st.cooldownUntil, Date.now() + ms);
  st.networkFailures = 0;
  if (st.cooling) return;
  st.cooling = true;
  console.warn(`[httpClient] ${host} is cooling down for ${Math.round(ms / 1000)}s`);
  const timer = setTimeout(function leave() {
    if (Date.now() < st.cooldownUntil) return void setTimeout(leave, st.cooldownUntil - Date.now()).unref?.();
    st.cooling = false;
    console.warn(`[httpClient] ${host} cooldown over`);
  }, ms);
  timer.unref?.();
}

/** Retry-After as milliseconds: delta-seconds or an HTTP date; undefined when absent or unparseable. */
function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits for a concurrency slot, then for this host's next rate slot; the caller must call release(). */
async function acquire(host: string, st: HostState) {
  const limit = HOST_LIMITS[host] ?? DEFAULT_HOST_LIMIT;
  if (st.active >= limit.concurrent) await new Promise<void>((resolve) => st.waiters.push(resolve));
  else st.active++;
  // A waiter inherits the releasing call's slot (see release).
  const start = Math.max(Date.now(), st.nextSlot);
  st.nextSlot = start + 1000 / limit.perSecond;
  if (start > Date.now()) await sleep(start - Date.now());
}

function release(st: HostState) {
  const next = st.waiters.shift();
  if (next) next();
  else st.active--;
}

function isRefused(err: unknown): boolean {
  return (err as { cause?: { code?: string } })?.cause?.code === "ECONNREFUSED";
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
  const host = new URL(url).hostname;
  const st = hostState(host);
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const isLastAttempt = attempt === MAX_ATTEMPTS - 1;
    checkCooldown(host, st);
    await acquire(host, st);
    try {
      // A cooldown can open while this call waited its turn.
      checkCooldown(host, st);
      const res = await attemptOnce(url, init, timeoutMs);
      if (res.status === 429 || res.status === 503) {
        const retryAfterMs = parseRetryAfter(res.headers?.get("Retry-After"));
        openCooldown(host, st, retryAfterMs);
        throw new UpstreamUnavailableError(host, st.cooldownUntil - Date.now());
      }
      if (res.status < 500) {
        st.networkFailures = 0;
        if (res.ok) st.backoffMs = 0;
      }
      // A successful response, a genuine client error (4xx), or the last
      // attempt's response either way — this is what the caller gets, same
      // as if this function had never retried at all.
      if (res.ok || res.status < 500 || isLastAttempt) return res;
      lastError = new Error(`Request to ${url} failed with ${res.status}`);
    } catch (err) {
      if (err instanceof UpstreamUnavailableError) throw err;
      if (++st.networkFailures >= NETWORK_FAILURES_BEFORE_COOLDOWN) openCooldown(host, st);
      if (isLastAttempt || isRefused(err)) throw err;
      lastError = err;
    } finally {
      release(st);
    }
    await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
  }

  // Unreachable — the loop above always returns or throws on its last
  // attempt — but keeps this function's return type honest for TypeScript.
  throw lastError;
}
