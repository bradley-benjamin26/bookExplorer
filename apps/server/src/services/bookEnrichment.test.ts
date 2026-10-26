import { describe, expect, it, vi } from "vitest";
import { UpstreamUnavailableError } from "../httpClient.js";
import { DEGRADED_TTL_MS, optionalSource } from "./bookEnrichment.js";

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
