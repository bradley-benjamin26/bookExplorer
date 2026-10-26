import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout, resetUpstreamState, UpstreamUnavailableError } from "./httpClient.js";

function mockResponse(status: number, ok = status >= 200 && status < 300): Response {
  return { ok, status } as Response;
}

describe("fetchWithTimeout retry behavior", () => {
  beforeEach(() => resetUpstreamState());
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a successful response on the first attempt without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithTimeout("https://example.com");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 4xx response — it's a real answer, not a transient failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(404));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithTimeout("https://example.com");
    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 5xx response and returns the eventual success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(500))
      .mockResolvedValueOnce(mockResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithTimeout("https://example.com");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a thrown network error and returns the eventual success", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("network blip")).mockResolvedValueOnce(mockResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithTimeout("https://example.com");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after exhausting all attempts and returns the last 5xx response rather than throwing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(500));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithTimeout("https://example.com");
    expect(res.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("gives up after exhausting all attempts and rethrows a persistent network error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("still down"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWithTimeout("https://example.com")).rejects.toThrow("still down");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

function res(status: number, retryAfter?: string): Response {
  return { ok: status < 300, status, headers: new Headers(retryAfter ? { "Retry-After": retryAfter } : {}) } as Response;
}
const refused = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });

describe("fetchWithTimeout per-host limits and cooldowns", () => {
  beforeEach(() => {
    resetUpstreamState();
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("spaces calls to a host at its per-second rate", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200));
    vi.stubGlobal("fetch", fetchMock);
    for (let i = 0; i < 6; i++) void fetchWithTimeout("https://openlibrary.org/a");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000); // 3/s: the 4th call starts at ~1 s
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("caps concurrent requests to a host", async () => {
    let open = 0;
    let peak = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      peak = Math.max(peak, ++open);
      await new Promise((r) => setTimeout(r, 3000));
      open--;
      return res(200);
    }));
    const all = Promise.all(Array.from({ length: 8 }, () => fetchWithTimeout("https://api.hardcover.app/x")));
    await vi.advanceTimersByTimeAsync(60_000);
    await all;
    expect(peak).toBe(2);
  });

  it("does not let one host's queue delay another", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200));
    vi.stubGlobal("fetch", fetchMock);
    for (let i = 0; i < 5; i++) void fetchWithTimeout("https://api.hardcover.app/x");
    void fetchWithTimeout("https://www.wikidata.org/y");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["https://api.hardcover.app/x", "https://www.wikidata.org/y"]);
  });

  it("opens a Retry-After cooldown on 429, fails fast during it, then calls again", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(res(429, "120")).mockResolvedValue(res(200));
    vi.stubGlobal("fetch", fetchMock);
    const first = fetchWithTimeout("https://openlibrary.org/a");
    const firstResult = expect(first).rejects.toMatchObject({ host: "openlibrary.org", retryAfterMs: 120_000 });
    await vi.advanceTimersByTimeAsync(0);
    await firstResult;
    await expect(fetchWithTimeout("https://openlibrary.org/b")).rejects.toBeInstanceOf(UpstreamUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(console.warn).toHaveBeenCalledTimes(2); // cooldown over
    const after = fetchWithTimeout("https://openlibrary.org/c");
    await vi.advanceTimersByTimeAsync(1000);
    expect((await after).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reads an HTTP-date Retry-After", async () => {
    const date = new Date(Date.now() + 90_000).toUTCString();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(429, date)));
    const p = expect(fetchWithTimeout("https://openlibrary.org/a")).rejects.toMatchObject({ retryAfterMs: expect.any(Number) });
    await vi.advanceTimersByTimeAsync(0);
    await p;
    const err = (await fetchWithTimeout("https://openlibrary.org/b").catch((e) => e)) as UpstreamUnavailableError;
    expect(err.retryAfterMs).toBeGreaterThan(85_000);
    expect(err.retryAfterMs).toBeLessThanOrEqual(90_000);
  });

  it("backs off a 503 without Retry-After exponentially, capped at 10 minutes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(503));
    vi.stubGlobal("fetch", fetchMock);
    const waits: number[] = [];
    for (let i = 0; i < 7; i++) {
      const p = fetchWithTimeout("https://openlibrary.org/a").catch((e) => e as UpstreamUnavailableError);
      await vi.advanceTimersByTimeAsync(1000);
      const err = (await p) as UpstreamUnavailableError;
      waits.push(err.retryAfterMs);
      await vi.advanceTimersByTimeAsync(err.retryAfterMs);
    }
    expect(waits.map((w) => Math.round(w / 1000))).toEqual([30, 60, 120, 240, 480, 600, 600]);
    expect(fetchMock).toHaveBeenCalledTimes(7); // never retried
  });

  it("opens a cooldown after repeated refused connections, without retrying each", async () => {
    const fetchMock = vi.fn().mockRejectedValue(refused());
    vi.stubGlobal("fetch", fetchMock);
    for (let i = 0; i < 3; i++) {
      const p = expect(fetchWithTimeout("https://openlibrary.org/a")).rejects.toThrow("fetch failed");
      await vi.advanceTimersByTimeAsync(1000);
      await p;
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await expect(fetchWithTimeout("https://openlibrary.org/a")).rejects.toBeInstanceOf(UpstreamUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("still retries a one-off timeout and resets the failure count on success", async () => {
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise(() => {})).mockResolvedValue(res(200));
    vi.stubGlobal("fetch", fetchMock);
    const p = fetchWithTimeout("https://example.com/a", {}, 1000);
    await vi.advanceTimersByTimeAsync(5000);
    expect((await p).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
