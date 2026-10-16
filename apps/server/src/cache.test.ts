import { afterEach, describe, expect, it, vi } from "vitest";
import { TtlCache } from "./cache.js";

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
});
