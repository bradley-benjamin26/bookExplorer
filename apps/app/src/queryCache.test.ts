import { QueryClient } from "@tanstack/react-query";
import { persistQueryClientRestore, persistQueryClientSave, type PersistedClient } from "@tanstack/react-query-persist-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "./test/asyncStorageMock";
import { CACHE_SCHEMA_VERSION, createPerQueryPersister, persistOptions, pruneClient, savedKeyFor } from "./queryCache";
import { toggleSaved } from "./storage/savedItems";

vi.mock("@react-native-async-storage/async-storage", () => import("./test/asyncStorageMock"));

const query = (queryKey: unknown[], dataUpdatedAt: number, status: "success" | "error" = "success") =>
  ({ queryKey, queryHash: JSON.stringify(queryKey), state: { data: { id: queryKey[1] }, dataUpdatedAt, status, error: null } }) as unknown as PersistedClient["clientState"]["queries"][number];

const client = (queries: PersistedClient["clientState"]["queries"]): PersistedClient => ({
  timestamp: 0,
  buster: "",
  clientState: { queries, mutations: [] },
});

const keys = (c: PersistedClient) => c.clientState.queries.map((q) => q.queryKey.join(":"));

describe("savedKeyFor", () => {
  it("maps detail and graph queries to their saved-item key and ignores the rest", () => {
    expect(savedKeyFor(["book", "123"])).toBe("book:123");
    expect(savedKeyFor(["book", "0306406152"], { isbn: "9780306406157" })).toBe("book:9780306406157");
    expect(savedKeyFor(["graph", "work", "OL1W"])).toBe("work:OL1W");
    expect(savedKeyFor(["search", { q: "x" }])).toBeNull();
  });
});

describe("pruneClient", () => {
  it("keeps saved items however old, caps the rest to the most recent, and drops unsaved graphs and searches", () => {
    const unsaved = Array.from({ length: 5 }, (_, i) => query(["book", `u${i}`], 100 + i));
    const pruned = pruneClient(
      client([
        query(["author", "saved"], 1),
        query(["graph", "author", "saved"], 1),
        query(["graph", "work", "other"], 999),
        query(["search", { q: "x" }], 999),
        ...unsaved,
      ]),
      new Set(["author:saved"]),
      3
    );
    expect(keys(pruned).sort()).toEqual(["author:saved", "book:u2", "book:u3", "book:u4", "graph:author:saved"]);
  });

  it("over the size budget, evicts unsaved details then saved graphs, oldest first, and never saved details", () => {
    const all = [
      query(["book", "saved"], 1),
      query(["graph", "book", "saved"], 2),
      query(["graph", "author", "savedNew"], 5),
      query(["author", "savedNew"], 6),
      query(["work", "old"], 3),
      query(["work", "new"], 4),
    ];
    const saved = new Set(["book:saved", "author:savedNew"]);
    const size = (qs: typeof all) => qs.reduce((n, q) => n + JSON.stringify(q).length, 0);
    const prune = (keep: typeof all) => keys(pruneClient(client(all), saved, 50, size(keep))).sort();

    // Room for all but one: the oldest unsaved detail goes first.
    expect(prune(all.filter((q) => q.queryKey[1] !== "old"))).toEqual(["author:savedNew", "book:saved", "graph:author:savedNew", "graph:book:saved", "work:new"]);
    // Room for saved details plus one graph: every unsaved detail, then the older saved graph.
    expect(prune([all[0], all[2], all[3]])).toEqual(["author:savedNew", "book:saved", "graph:author:savedNew"]);
    // No room at all: saved details still stay.
    expect(keys(pruneClient(client(all), saved, 50, 0)).sort()).toEqual(["author:savedNew", "book:saved"]);
  });

  it("stores data kept through a failed refetch as success", () => {
    const pruned = pruneClient(client([query(["book", "1"], 1, "error")]), new Set());
    expect(pruned.clientState.queries[0].state.status).toBe("success");
  });
});

describe("persisted query cache", () => {
  beforeEach(() => AsyncStorage.clear());

  const book = { isbn: "1", title: "Cached" };
  const options = { ...persistOptions, persister: createPerQueryPersister(0) }; // no throttle wait between test saves
  const save = (queryClient: QueryClient) => persistQueryClientSave({ queryClient, ...options });
  const restore = async (buster = persistOptions.buster) => {
    const queryClient = new QueryClient();
    await persistQueryClientRestore({ queryClient, ...options, buster });
    return queryClient;
  };

  it("serves the last good response when a refetch fails, and keeps it persisted", async () => {
    const first = new QueryClient();
    await first.fetchQuery({ queryKey: ["book", "1"], queryFn: () => book });
    await save(first);

    const offline = await restore();
    await expect(offline.fetchQuery({ queryKey: ["book", "1"], queryFn: () => Promise.reject(new TypeError("Network request failed")) })).rejects.toThrow();
    expect(offline.getQueryData(["book", "1"])).toEqual(book);

    await save(offline);
    expect((await restore()).getQueryData(["book", "1"])).toEqual(book);
  });

  it("never evicts a saved item's detail however many others are viewed after it", async () => {
    await toggleSaved({ type: "book", id: "1", title: "Cached" });
    const queryClient = new QueryClient();
    queryClient.setQueryData(["book", "1"], book, { updatedAt: 1 }); // the oldest entry, first in line for LRU eviction
    for (let i = 0; i < 60; i++) await queryClient.fetchQuery({ queryKey: ["work", `w${i}`], queryFn: () => ({ i }) });
    await save(queryClient);

    const restored = await restore();
    expect(restored.getQueryData(["book", "1"])).toEqual(book);
    expect(restored.getQueryCache().getAll()).toHaveLength(51);
  });

  it("protects a book saved under the server's ISBN, as the book screen saves it, when opened by the other ISBN form", async () => {
    const fetched = { isbn: "9780306406157", title: "Cached" };
    await toggleSaved({ type: "book", id: fetched.isbn, title: fetched.title }); // what book/[isbn].tsx does: id = data.isbn
    const queryClient = new QueryClient();
    queryClient.setQueryData(["book", "0306406152"], fetched, { updatedAt: 1 });
    for (let i = 0; i < 60; i++) await queryClient.fetchQuery({ queryKey: ["work", `w${i}`], queryFn: () => ({ i }) });
    await save(queryClient);
    expect((await restore()).getQueryData(["book", "0306406152"])).toEqual(fetched);
  });

  it("drops the cache when the schema version is bumped", async () => {
    const queryClient = new QueryClient();
    await queryClient.fetchQuery({ queryKey: ["book", "1"], queryFn: () => book });
    await save(queryClient);
    expect((await restore(String(CACHE_SCHEMA_VERSION + 1))).getQueryData(["book", "1"])).toBeUndefined();
  });

  it("stores each query under its own key, drops a pruned query's key and clears them all on a version change", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["book", "1"], book);
    queryClient.setQueryData(["author", "OL1A"], { id: "OL1A" });
    await save(queryClient);
    const keysOf = async () => (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith("book-explorer:query-cache")).sort();
    expect(await keysOf()).toHaveLength(3); // the index plus one per query

    queryClient.removeQueries({ queryKey: ["author"] });
    await save(queryClient);
    expect(await keysOf()).toHaveLength(2);

    await restore(String(CACHE_SCHEMA_VERSION + 1));
    expect(await keysOf()).toEqual([]);
  });

  it("ignores an older single-value cache and a query whose stored value is corrupt", async () => {
    await AsyncStorage.setItem("book-explorer:query-cache", JSON.stringify({ timestamp: 0, buster: "1", clientState: { queries: [], mutations: [] } }));
    expect((await restore()).getQueryCache().getAll()).toHaveLength(0);

    const queryClient = new QueryClient();
    queryClient.setQueryData(["book", "1"], book);
    queryClient.setQueryData(["book", "2"], book);
    await save(queryClient);
    await AsyncStorage.setItem('book-explorer:query-cache:q:["book","2"]', "{oops");
    expect((await restore()).getQueryCache().getAll()).toHaveLength(1);
  });
});
