import type { SavedBookRecord } from "./storage/savedBooks";
import type { SavedWorkRecord } from "./storage/savedWorks";

export const PREFETCH_CONCURRENCY = 2;
export const PREFETCH_DELAY_MS = 500;

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

/**
 * Runs `fetchOne` over every target with at most `concurrency` in flight, each worker pausing `delayMs` after
 * each request. Returns the targets whose fetch failed; one failure never stops the rest.
 */
export async function runBounded(
  targets: PrefetchTarget[],
  fetchOne: (target: PrefetchTarget) => Promise<unknown>,
  concurrency = PREFETCH_CONCURRENCY,
  delayMs = PREFETCH_DELAY_MS
): Promise<PrefetchTarget[]> {
  const queue = [...targets];
  const failed: PrefetchTarget[] = [];
  const worker = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      await fetchOne(t).catch(() => failed.push(t));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return failed;
}
