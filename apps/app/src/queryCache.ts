import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PersistedClient, PersistQueryClientOptions, Persister } from "@tanstack/react-query-persist-client";
import { getSavedItems } from "./storage/savedItems";

// Bump when a cached response shape changes; the persisted cache is then dropped on next launch.
export const CACHE_SCHEMA_VERSION = 1;
export const CACHE_LIMIT = 50;
// Total size budget across all stored queries (each is its own AsyncStorage value, so no single value nears
// Android's ~2 MB read limit). Characters, not bytes, so this leaves room for non-ASCII text and web's ~5 MB quota.
export const CACHE_MAX_CHARS = 1_000_000;

const DETAIL_TYPES = ["book", "work", "author", "subject"];

/** The `type:id` saved-item key a detail or graph query belongs to, or null for queries the offline cache ignores. */
export function savedKeyFor(queryKey: readonly unknown[], data?: unknown): string | null {
  const [kind, a, b] = queryKey;
  if (kind === "graph") return `${a}:${b}`;
  // A book is saved under the ISBN the server returned, which can be the other (10 vs 13) form of the one in the route.
  if (kind === "book") return `book:${(data as { isbn?: string } | undefined)?.isbn ?? a}`;
  return DETAIL_TYPES.includes(kind as string) ? `${kind}:${a}` : null;
}

/**
 * Keeps every saved item's detail and graph, plus the `limit` most recently fetched other details; drops the rest
 * (search, unsaved graphs). Then, while over `maxChars` serialized, evicts oldest first: unsaved details, then saved
 * graphs. Saved details are never evicted, since they're the offline copy of the user's library.
 */
export function pruneClient(client: PersistedClient, savedKeys: Set<string>, limit = CACHE_LIMIT, maxChars = CACHE_MAX_CHARS): PersistedClient {
  const kept = client.clientState.queries.filter((q) => savedKeyFor(q.queryKey) !== null);
  const isSaved = (q: (typeof kept)[number]) => savedKeys.has(savedKeyFor(q.queryKey, q.state.data)!);
  const recent = kept
    .filter((q) => !isSaved(q) && q.queryKey[0] !== "graph")
    .sort((x, y) => y.state.dataUpdatedAt - x.state.dataUpdatedAt)
    .slice(0, limit);
  // A failed offline refetch leaves status "error" over still-good data; restore it as plain success.
  let queries = kept
    .filter((q) => isSaved(q) || recent.includes(q))
    .map((q) => (q.state.status === "error" ? { ...q, state: { ...q.state, status: "success" as const, error: null } } : q));

  const sizes = new Map(queries.map((q) => [q, JSON.stringify(q).length]));
  let total = [...sizes.values()].reduce((n, size) => n + size, 0);
  const oldestFirst = (qs: typeof queries) => qs.sort((x, y) => x.state.dataUpdatedAt - y.state.dataUpdatedAt);
  const evictable = [
    ...oldestFirst(queries.filter((q) => !isSaved(q))),
    ...oldestFirst(queries.filter((q) => isSaved(q) && q.queryKey[0] === "graph")),
  ];
  const evicted = new Set<(typeof queries)[number]>();
  for (const q of evictable) {
    if (total <= maxChars) break;
    total -= sizes.get(q)!;
    evicted.add(q);
  }
  queries = queries.filter((q) => !evicted.has(q));
  return { ...client, clientState: { ...client.clientState, queries, mutations: [] } };
}

const CACHE_KEY = "book-explorer:query-cache";
const queryKey = (hash: string) => `${CACHE_KEY}:q:${hash}`;

interface CacheMeta {
  timestamp: number;
  buster: string;
  hashes: string[];
}

async function readMeta(): Promise<CacheMeta | null> {
  try {
    const meta = JSON.parse((await AsyncStorage.getItem(CACHE_KEY)) ?? "null");
    return Array.isArray(meta?.hashes) ? meta : null; // an older single-value cache has no `hashes`: ignored, then overwritten
  } catch {
    return null;
  }
}

/**
 * Stores each query under its own AsyncStorage key, plus a small index (the meta) under CACHE_KEY. Saves are pruned
 * with `pruneClient`, skip queries unchanged since the last write, are serialized, and wait `throttleMs` apart.
 */
export function createPerQueryPersister(throttleMs = 1000): Persister {
  const written = new Map<string, string>();
  let chain: Promise<void> = Promise.resolve();
  let latest: PersistedClient | undefined;

  const save = async (client: PersistedClient) => {
    const saved = new Set((await getSavedItems()).map((i) => `${i.type}:${i.id}`));
    const { clientState, timestamp, buster } = pruneClient(client, saved);
    const previous = await readMeta();
    const hashes = clientState.queries.map((q) => q.queryHash);
    await Promise.all(
      clientState.queries.map(async (q) => {
        const value = JSON.stringify(q);
        if (written.get(q.queryHash) === value) return;
        await AsyncStorage.setItem(queryKey(q.queryHash), value);
        written.set(q.queryHash, value);
      })
    );
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp, buster, hashes } satisfies CacheMeta));
    await Promise.all(
      (previous?.hashes ?? []).filter((h) => !hashes.includes(h)).map((h) => (written.delete(h), AsyncStorage.removeItem(queryKey(h))))
    );
    await new Promise((resolve) => setTimeout(resolve, throttleMs));
  };

  return {
    persistClient: (client) => {
      latest = client;
      // Queued saves that were overtaken by a newer client are skipped.
      const run = chain.then(() => (latest === client ? save(client) : undefined));
      chain = run.catch(() => {}); // one failed save must not block the later ones
      return run;
    },
    restoreClient: async () => {
      const meta = await readMeta();
      if (!meta) return undefined;
      const queries = await Promise.all(
        meta.hashes.map(async (h) => {
          try {
            return JSON.parse((await AsyncStorage.getItem(queryKey(h))) ?? "null");
          } catch {
            return null;
          }
        })
      );
      return { timestamp: meta.timestamp, buster: meta.buster, clientState: { queries: queries.filter(Boolean), mutations: [] } };
    },
    removeClient: async () => {
      const meta = await readMeta();
      written.clear();
      await Promise.all([...(meta?.hashes ?? []).map((h) => AsyncStorage.removeItem(queryKey(h))), AsyncStorage.removeItem(CACHE_KEY)]);
    },
  };
}

export const persistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
  persister: createPerQueryPersister(),
  buster: String(CACHE_SCHEMA_VERSION),
  maxAge: Infinity, // saved items must never age out; the LRU cap bounds the rest
  // Default only dehydrates "success"; a failed offline refetch must not drop the data it kept.
  dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.data !== undefined },
};
