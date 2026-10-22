import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedBookRecord } from "./storage/savedBooks";
import type { SavedWorkRecord } from "./storage/savedWorks";
import { pendingTargets, runBounded, type PrefetchTarget } from "./prefetchSaved";

const book = (isbn: string, deletedAt?: number) => ({ isbn, deletedAt }) as SavedBookRecord;
const work = (id: string, deletedAt?: number) => ({ openLibraryWorkId: id, deletedAt }) as SavedWorkRecord;
const targets = (n: number): PrefetchTarget[] => Array.from({ length: n }, (_, i) => ({ kind: "work", id: `OL${i}W` }));

afterEach(() => vi.useRealTimers());

describe("pendingTargets", () => {
  it("returns only uncached live items and skips tombstones", () => {
    const result = pendingTargets(
      [book("1"), book("2"), book("3", 5)],
      [work("A"), work("B", 5), work("C")],
      (t) => t.id === "2" || t.id === "C"
    );
    expect(result).toEqual([
      { kind: "book", id: "1" },
      { kind: "work", id: "A" },
    ]);
  });
});

describe("runBounded", () => {
  it("never exceeds the concurrency and waits the delay between requests", async () => {
    vi.useFakeTimers();
    let active = 0;
    let peak = 0;
    const started: number[] = [];
    const fetchOne = async () => {
      started.push(Date.now());
      peak = Math.max(peak, ++active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
    };
    const done = runBounded(targets(4), fetchOne, 2, 100);
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(109);
    expect(started).toHaveLength(2); // still inside the delay
    await vi.advanceTimersByTimeAsync(1);
    expect(started).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(200);
    await done;
    expect(peak).toBe(2);
  });

  it("keeps going after a failed fetch and reports it", async () => {
    vi.useFakeTimers();
    const fetchOne = vi.fn((t: PrefetchTarget) => (t.id === "OL1W" ? Promise.reject(new Error("503")) : Promise.resolve()));
    const done = runBounded(targets(3), fetchOne, 1, 10);
    await vi.advanceTimersByTimeAsync(100);
    expect(await done).toEqual([{ kind: "work", id: "OL1W" }]);
    expect(fetchOne).toHaveBeenCalledTimes(3);
  });
});
