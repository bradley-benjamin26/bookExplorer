import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TtlCache, closePersistentCache, initPersistentCache } from "./cache.js";

describe("TtlCache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("evicts the oldest entry once maxEntries is reached", () => {
    const cache = new TtlCache<number>(60_000, 2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
  });

  it("treats re-setting a key as the newest entry", () => {
    const cache = new TtlCache<number>(60_000, 2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 10);
    cache.set("c", 3);
    expect(cache.get("a")).toBe(10);
    expect(cache.get("b")).toBeUndefined();
  });

  it("expires entries after the TTL", () => {
    vi.useFakeTimers();
    const cache = new TtlCache<number>(1_000);
    cache.set("a", 1);
    vi.advanceTimersByTime(1_001);
    expect(cache.get("a")).toBeUndefined();
  });

  it("shares one fetch between concurrent callers for the same key", async () => {
    const cache = new TtlCache<number>(60_000);
    const fetcher = vi.fn(async () => 42);
    const [a, b] = await Promise.all([cache.wrap("k", fetcher), cache.wrap("k", fetcher)]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("lets a fetcher shorten its own entry's TTL", async () => {
    vi.useFakeTimers();
    const cache = new TtlCache<number>(60_000);
    await cache.wrap("k", async (entry) => {
      entry.ttlMs = 1_000;
      return 1;
    });
    vi.advanceTimersByTime(999);
    expect(cache.get("k")).toBe(1);
    vi.advanceTimersByTime(2);
    expect(cache.get("k")).toBeUndefined();
  });
});

describe("TtlCache persistent tier", () => {
  afterEach(() => {
    closePersistentCache();
    vi.useRealTimers();
  });

  it("serves from SQLite after the memory tier is gone", async () => {
    initPersistentCache(":memory:");
    const fetcher = vi.fn(async () => ({ n: 1 }));
    await new TtlCache<{ n: number }>(60_000, 1000, "t").wrap("k", fetcher);
    const fresh = new TtlCache<{ n: number }>(60_000, 1000, "t");
    expect(await fresh.wrap("k", fetcher)).toEqual({ n: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("ignores expired rows", async () => {
    vi.useFakeTimers();
    initPersistentCache(":memory:");
    const fetcher = vi.fn(async () => 1);
    await new TtlCache<number>(1_000, 1000, "t").wrap("k", fetcher);
    vi.advanceTimersByTime(1_001);
    await new TtlCache<number>(1_000, 1000, "t").wrap("k", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("persists a lowered (degraded) ttl", async () => {
    vi.useFakeTimers();
    initPersistentCache(":memory:");
    const fetcher = vi.fn(async (entry: { ttlMs: number }) => {
      entry.ttlMs = 100;
      return 1;
    });
    await new TtlCache<number>(60_000, 1000, "t").wrap("k", fetcher);
    vi.advanceTimersByTime(101);
    await new TtlCache<number>(60_000, 1000, "t").wrap("k", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps namespaces separate", async () => {
    initPersistentCache(":memory:");
    await new TtlCache<number>(60_000, 1000, "a").wrap("k", async () => 1);
    expect(await new TtlCache<number>(60_000, 1000, "b").wrap("k", async () => 2)).toBe(2);
  });

  it("falls back to memory when the DB is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    initPersistentCache("/nonexistent-dir/cache.db");
    const cache = new TtlCache<number>(60_000, 1000, "t");
    const fetcher = vi.fn(async () => 1);
    await cache.wrap("k", fetcher);
    await cache.wrap("k", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("cache module", () => {
  it("doesn't load node:sqlite until persistence is turned on, so the default server runs on Node 20", () => {
    // A fresh process: this test process may already have loaded node:sqlite.
    const script = `await import(${JSON.stringify(fileURLToPath(new URL("./cache.ts", import.meta.url)))});
console.log(process.moduleLoadList.some((m) => m.includes("sqlite")));`;
    const out = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { encoding: "utf8" });
    expect(out.trim()).toBe("false");
  });
});
