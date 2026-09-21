import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "./httpClient.js";

function mockResponse(status: number, ok = status >= 200 && status < 300): Response {
  return { ok, status } as Response;
}

describe("fetchWithTimeout retry behavior", () => {
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
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(503));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithTimeout("https://example.com");
    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("gives up after exhausting all attempts and rethrows a persistent network error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("still down"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWithTimeout("https://example.com")).rejects.toThrow("still down");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
