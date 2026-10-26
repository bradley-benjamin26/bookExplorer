import type { SavedBookRecord } from "./storage/savedBooks";
import type { SavedWorkRecord } from "./storage/savedWorks";

// The server allows 100 requests/min per IP (apps/server/src/index.ts); one at a time every 2 s is at most
// 30 items/min (60 requests if every book needs its alternate-ISBN retry), leaving room for the screens.
export const PREFETCH_CONCURRENCY = 1;
export const PREFETCH_DELAY_MS = 2000;

export interface PrefetchTarget {
  kind: "book" | "work";
  id: string;
}

/** Live saved books and works that `isCached` says have no detail entry yet; tombstones are skipped. */
export function pendingTargets(
  books: SavedBookRecord[],
  works: SavedWorkRecord[],
  isCached: (target: PrefetchTarget) => boolean
): PrefetchTarget[] {
  return [
    ...books.filter((b) => !b.deletedAt).map((b): PrefetchTarget => ({ kind: "book", id: b.isbn })),
    ...works.filter((w) => !w.deletedAt).map((w): PrefetchTarget => ({ kind: "work", id: w.openLibraryWorkId })),
  ].filter((t) => !isCached(t));
}

/** A rate limit, an unavailable server or no network (no status): every later request would fail too. */
export function stopsPass(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status !== "number" || status === 429 || status === 503;
}

/**
 * Runs `fetchOne` over every target with at most `concurrency` in flight, each worker pausing `delayMs` after
 * each request. Returns the targets whose fetch failed on their own (a 404, a 500), which never stop the rest.
 * An error `stopsPass` accepts ends the pass instead, and neither it nor the targets not reached are returned.
 */
export async function runBounded(
  targets: PrefetchTarget[],
  fetchOne: (target: PrefetchTarget) => Promise<unknown>,
  concurrency = PREFETCH_CONCURRENCY,
  delayMs = PREFETCH_DELAY_MS
): Promise<PrefetchTarget[]> {
  const queue = [...targets];
  const failed: PrefetchTarget[] = [];
  let stopped = false;
  const worker = async () => {
    for (let t = queue.shift(); t && !stopped; t = queue.shift()) {
      await fetchOne(t).catch((err) => (stopsPass(err) ? (stopped = true) : failed.push(t)));
      if (stopped) return;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return failed;
}
