import { afterEach, describe, expect, it, vi } from "vitest";
import { UpstreamUnavailableError } from "../httpClient.js";
import { fetchMetadataByAnyIsbn } from "../sources/loc.js";
import { DEGRADED_TTL_MS, LOC_BUDGET_MS, optionalSource, startCommonEnrichment, withinBudget } from "./bookEnrichment.js";

vi.mock("../sources/loc.js", () => ({
  EMPTY_METADATA: { subjects: [], genres: [], lcc: null, ddc: null, lccn: null, summary: null },
  fetchMetadataByAnyIsbn: vi.fn(),
}));
vi.mock("../sources/hardcover.js", () => ({ lookupByAnyIsbn: vi.fn(async () => null) }));
vi.mock("../sources/openLibrary.js", () => ({ getRatings: vi.fn(async () => null) }));

afterEach(() => vi.useRealTimers());

describe("optionalSource", () => {
  it("falls back and shortens the cache entry's TTL when the source fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const entry = { ttlMs: 1000 * 60 * 60 };
    const result = await Promise.reject(new Error("down")).catch(optionalSource(entry, "test", "fallback"));
    expect(result).toBe("fallback");
    expect(entry.ttlMs).toBe(DEGRADED_TTL_MS);
    warn.mockRestore();
  });

  it("never lengthens a TTL that's already shorter", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const entry = { ttlMs: 1000 };
    await Promise.reject(new Error("down")).catch(optionalSource(entry, "test", null));
    expect(entry.ttlMs).toBe(1000);
    warn.mockRestore();
  });

  it("leaves the TTL alone when the source succeeds", async () => {
    const entry = { ttlMs: 1000 * 60 * 60 };
    const result = await Promise.resolve("ok").catch(optionalSource(entry, "test", "fallback"));
    expect(result).toBe("ok");
    expect(entry.ttlMs).toBe(1000 * 60 * 60);
  });

  it("omits a source in cooldown with the degraded TTL, without logging per request", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const entry = { ttlMs: 1000 * 60 * 60 };
    const result = await Promise.reject(new UpstreamUnavailableError("api.hardcover.app", 60_000)).catch(optionalSource(entry, "hardcover", null));
    expect(result).toBeNull();
    expect(entry.ttlMs).toBe(DEGRADED_TTL_MS);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("withinBudget", () => {
  it("returns the value when it arrives in time", async () => {
    const onLate = vi.fn();
    await expect(withinBudget(Promise.resolve("ok"), 5_000, "fallback", onLate)).resolves.toBe("ok");
    expect(onLate).not.toHaveBeenCalled();
  });

  it("serves the fallback and reports lateness when the budget runs out", async () => {
    vi.useFakeTimers();
    const onLate = vi.fn();
    const result = withinBudget(new Promise<string>(() => {}), 5_000, "fallback", onLate);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(result).resolves.toBe("fallback");
    expect(onLate).toHaveBeenCalledTimes(1);
  });

  it("clears its timer once the promise settles", async () => {
    vi.useFakeTimers();
    await withinBudget(Promise.resolve("ok"), 5_000, "fallback", vi.fn());
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("startCommonEnrichment LoC budget", () => {
  it("a hung LoC lookup costs a book at most LOC_BUDGET_MS and shortens its cache TTL", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(fetchMetadataByAnyIsbn).mockReturnValue(new Promise(() => {}));
    const entry = { ttlMs: 3_600_000 };
    const { locMetadataPromise } = startCommonEnrichment(["9780374528379"], null, entry);
    await vi.advanceTimersByTimeAsync(LOC_BUDGET_MS);
    expect(await locMetadataPromise).toEqual({ subjects: [], genres: [], lcc: null, ddc: null, lccn: null, summary: null });
    expect(entry.ttlMs).toBe(DEGRADED_TTL_MS);
    warn.mockRestore();
  });

  it("an on-time LoC answer is used and the TTL stays full", async () => {
    const meta = { subjects: ["x"], genres: [], lcc: null, ddc: null, lccn: null, summary: null };
    vi.mocked(fetchMetadataByAnyIsbn).mockResolvedValue(meta);
    const entry = { ttlMs: 3_600_000 };
    expect(await startCommonEnrichment(["9780374528379"], null, entry).locMetadataPromise).toBe(meta);
    expect(entry.ttlMs).toBe(3_600_000);
  });

  it("a fast LoC failure degrades the TTL once and warns once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(fetchMetadataByAnyIsbn).mockRejectedValue(new Error("dns"));
    const entry = { ttlMs: 3_600_000 };
    await startCommonEnrichment(["9780374528379"], null, entry).locMetadataPromise;
    expect(entry.ttlMs).toBe(DEGRADED_TTL_MS);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
