import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { PersistedClient, PersistQueryClientOptions } from "@tanstack/react-query-persist-client";
import { getSavedItems } from "./storage/savedItems";

// Bump when a cached response shape changes; the persisted cache is then dropped on next launch.
export const CACHE_SCHEMA_VERSION = 1;
export const CACHE_LIMIT = 50;

const DETAIL_TYPES = ["book", "work", "author", "subject"];

/** The `type:id` saved-item key a detail or graph query belongs to, or null for queries the offline cache ignores. */
export function savedKeyFor(queryKey: readonly unknown[]): string | null {
  const [kind, a, b] = queryKey;
  if (kind === "graph") return `${a}:${b}`;
  return DETAIL_TYPES.includes(kind as string) ? `${kind}:${a}` : null;
}

/** Keeps every saved item's detail and graph, plus the `limit` most recently fetched other details; drops the rest (search, unsaved graphs). */
export function pruneClient(client: PersistedClient, savedKeys: Set<string>, limit = CACHE_LIMIT): PersistedClient {
  const kept = client.clientState.queries.filter((q) => savedKeyFor(q.queryKey) !== null);
  const isSaved = (q: (typeof kept)[number]) => savedKeys.has(savedKeyFor(q.queryKey)!);
  const recent = kept
    .filter((q) => !isSaved(q) && q.queryKey[0] !== "graph")
    .sort((x, y) => y.state.dataUpdatedAt - x.state.dataUpdatedAt)
    .slice(0, limit);
  // A failed offline refetch leaves status "error" over still-good data; restore it as plain success.
  const queries = kept
    .filter((q) => isSaved(q) || recent.includes(q))
    .map((q) => (q.state.status === "error" ? { ...q, state: { ...q.state, status: "success" as const, error: null } } : q));
  return { ...client, clientState: { ...client.clientState, queries, mutations: [] } };
}

export const persistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
  persister: createAsyncStoragePersister({
    storage: AsyncStorage,
    key: "book-explorer:query-cache",
    serialize: async (client) => {
      const saved = new Set((await getSavedItems()).map((i) => `${i.type}:${i.id}`));
      return JSON.stringify(pruneClient(client, saved));
    },
  }),
  buster: String(CACHE_SCHEMA_VERSION),
  maxAge: Infinity, // saved items must never age out; the LRU cap bounds the rest
  // Default only dehydrates "success"; a failed offline refetch must not drop the data it kept.
  dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.data !== undefined },
};
