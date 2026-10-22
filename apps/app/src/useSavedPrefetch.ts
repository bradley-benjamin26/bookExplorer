import type { QueryClient } from "@tanstack/react-query";
import { useIsRestoring, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchBookWithAlternate } from "./api/bookLookup";
import { fetchWork } from "./api/client";
import { toAlternateIsbn } from "./isbn";
import { pendingTargets, runBounded, type PrefetchTarget } from "./prefetchSaved";
import { getAllSavedBooks } from "./storage/savedBooks";
import { getAllSavedWorks } from "./storage/savedWorks";

// Failed items are left for the next session (the server may be cooling down), so a rerun skips them too.
const failedThisSession = new Set<string>();
let running: Promise<void> | null = null;
let rerun = false;

const keyOf = (t: PrefetchTarget) => `${t.kind}:${t.id}`;

async function pass(queryClient: QueryClient) {
  const [books, works] = await Promise.all([getAllSavedBooks(), getAllSavedWorks()]);
  // The book screen keys its query by the route's ISBN, which may be the other (10 vs 13) form of the saved one.
  const cached = (t: PrefetchTarget) =>
    [t.id, ...(t.kind === "book" ? [toAlternateIsbn(t.id)] : [])].some(
      (id) => id && queryClient.getQueryData([t.kind, id]) !== undefined
    );
  const targets = pendingTargets(books, works, (t) => cached(t) || failedThisSession.has(keyOf(t)));
  // Same per-item public lookups the detail pages make; nothing about the library as a whole is sent.
  const failed = await runBounded(targets, (t) =>
    t.kind === "book"
      ? queryClient.fetchQuery({ queryKey: ["book", t.id], queryFn: () => fetchBookWithAlternate(t.id) })
      : queryClient.fetchQuery({ queryKey: ["work", t.id], queryFn: () => fetchWork(t.id) })
  );
  failed.forEach((t) => failedThisSession.add(keyOf(t)));
}

/** Fetches details for saved items that have none cached; a call during a run queues one more pass. */
export function prefetchMissingSaved(queryClient: QueryClient): Promise<void> {
  if (running) {
    rerun = true;
    return running;
  }
  running = (async () => {
    do {
      rerun = false;
      await pass(queryClient).catch(() => undefined);
    } while (rerun);
  })().finally(() => (running = null));
  return running;
}

/** Mount once, after storage migration. Imports call `prefetchMissingSaved` again when the saved list grows. */
export function useSavedPrefetch() {
  const queryClient = useQueryClient();
  // Waits for the persisted cache to load, or everything would look uncached.
  const restoring = useIsRestoring();
  useEffect(() => {
    if (!restoring) void prefetchMissingSaved(queryClient);
  }, [queryClient, restoring]);
}
