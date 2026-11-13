import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "../httpClient.js";
import { HardcoverRateLimitError, HardcoverUnavailableError, HardcoverUnauthorizedError, hardcoverGraphql, lookupByAnyIsbn, lookupByIsbn } from "./hardcover.js";

vi.mock("../httpClient.js", async () => ({
  ...(await vi.importActual<typeof import("../httpClient.js")>("../httpClient.js")),
  fetchWithTimeout: vi.fn(),
}));
const noMatch = { ok: true, json: async () => ({ data: { editions: [] } }) } as unknown as Response;
const match = { ok: true, json: async () => ({ data: { editions: [{ book: { rating: 4, ratings_count: 10, user_books: [] } }] } }) } as unknown as Response;
const isbns = ["1", "2", "3", "4", "5", "6", "7", "8"];

beforeEach(() => {
  vi.stubEnv("HARDCOVER_API_KEY", "k");
  vi.mocked(fetchWithTimeout).mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("stops after 5 ISBNs when none match", async () => {
  vi.mocked(fetchWithTimeout).mockResolvedValue(noMatch);
  expect(await lookupByAnyIsbn(isbns)).toBeNull();
  expect(fetchWithTimeout).toHaveBeenCalledTimes(5);
});

it("still finds a match on the 5th ISBN", async () => {
  vi.mocked(fetchWithTimeout).mockResolvedValueOnce(noMatch).mockResolvedValueOnce(noMatch).mockResolvedValueOnce(noMatch).mockResolvedValueOnce(noMatch).mockResolvedValueOnce(match);
  expect((await lookupByAnyIsbn(isbns))?.rating).toBe(4);
});

const sentAuth = () => (vi.mocked(fetchWithTimeout).mock.calls[0][1]?.headers as Record<string, string>).Authorization;
const sentQuery = () => JSON.parse(String(vi.mocked(fetchWithTimeout).mock.calls[0][1]?.body)).query as string;

it("uses the caller's token over the server key", async () => {
  vi.stubEnv("HARDCOVER_API_KEY", "server");
  const fetchMock = vi.fn().mockResolvedValue(match);
  vi.stubGlobal("fetch", fetchMock);
  await lookupByIsbn("1", "Bearer user");
  expect((fetchMock.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe("Bearer user");
});

it("a signed-in user's 429 throws HardcoverRateLimitError and never touches the shared host limiter", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, headers: new Headers({ "Retry-After": "30" }) }));
  await expect(hardcoverGraphql("q", {}, "Bearer user")).rejects.toMatchObject({ retryAfterSeconds: 30 });
  expect(fetchWithTimeout).not.toHaveBeenCalled();
});

it("the server key still goes through the shared limiter", async () => {
  vi.mocked(fetchWithTimeout).mockResolvedValue(match);
  await lookupByIsbn("1");
  expect(fetchWithTimeout).toHaveBeenCalled();
});

it("falls back to the server key when signed out", async () => {
  vi.stubEnv("HARDCOVER_API_KEY", "server");
  vi.mocked(fetchWithTimeout).mockResolvedValue(match);
  await lookupByIsbn("1", null);
  expect(sentAuth()).toBe("Bearer server");
});

it("skips Hardcover when neither is set", async () => {
  vi.stubEnv("HARDCOVER_API_KEY", "");
  expect(await lookupByIsbn("1")).toBeNull();
  expect(fetchWithTimeout).not.toHaveBeenCalled();
});

it("only asks for public reviews, since the result is cached for everyone", async () => {
  vi.mocked(fetchWithTimeout).mockResolvedValue(match);
  await lookupByIsbn("1");
  expect(sentQuery()).toContain("privacy_setting_id: { _eq: 1 }");
});

it("maps a 429 response to HardcoverRateLimitError using Retry-After", async () => {
  vi.mocked(fetchWithTimeout).mockResolvedValue(new Response("", { status: 429, headers: { "Retry-After": "7" } }));
  await expect(hardcoverGraphql("q", {}, "Bearer k")).rejects.toMatchObject({ name: "HardcoverRateLimitError", retryAfterSeconds: 7 });
});

it("defaults a 429's retry to 60s without Retry-After", async () => {
  vi.mocked(fetchWithTimeout).mockResolvedValue(new Response("", { status: 429 }));
  await expect(hardcoverGraphql("q", {}, "Bearer k")).rejects.toBeInstanceOf(HardcoverRateLimitError);
  await expect(hardcoverGraphql("q", {}, "Bearer k")).rejects.toMatchObject({ retryAfterSeconds: 60 });
});

it("maps fetchWithTimeout's UpstreamUnavailableError to HardcoverRateLimitError", async () => {
  const { UpstreamUnavailableError } = await vi.importActual<typeof import("../httpClient.js")>("../httpClient.js");
  vi.mocked(fetchWithTimeout).mockRejectedValue(new UpstreamUnavailableError("api.hardcover.app", 1200));
  await expect(hardcoverGraphql("q", {}, "Bearer k")).rejects.toMatchObject({ retryAfterSeconds: 2 });
});

it("throws HardcoverUnavailableError for a 503 and a 500", async () => {
  for (const status of [503, 500]) {
    vi.mocked(fetchWithTimeout).mockResolvedValue(new Response("", { status }));
    await expect(hardcoverGraphql("q", {}, "Bearer k")).rejects.toMatchObject({ name: "HardcoverUnavailableError", status });
    await expect(hardcoverGraphql("q", {}, "Bearer k")).rejects.toBeInstanceOf(HardcoverUnavailableError);
  }
});

it("maps 401 to HardcoverUnauthorizedError", async () => {
  vi.stubEnv("HARDCOVER_API_KEY", "secret");
  vi.mocked(fetchWithTimeout).mockResolvedValue(Response.json({ error: "invalid_token" }, { status: 401 }));
  await expect(hardcoverGraphql("q", {}, "Bearer secret")).rejects.toBeInstanceOf(HardcoverUnauthorizedError);
});

it("reports the missing scope on 403 without leaking the token", async () => {
  vi.stubEnv("HARDCOVER_API_KEY", "secret");
  vi.mocked(fetchWithTimeout).mockResolvedValue(Response.json({ error: "insufficient_scope", scope: "books:read" }, { status: 403 }));
  const err = await hardcoverGraphql("q", {}, "Bearer secret").catch((e: Error) => e);
  expect((err as Error).message).toContain("books:read");
  expect((err as Error).message).not.toContain("secret");
});

it("throws on GraphQL errors", async () => {
  vi.mocked(fetchWithTimeout).mockResolvedValue(Response.json({ errors: [{ message: "boom" }] }));
  await expect(hardcoverGraphql("q", {}, "Bearer k")).rejects.toThrow("boom");
});

it("a user's token: 401 maps to HardcoverUnauthorizedError", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "invalid_token" }, { status: 401 })));
  await expect(hardcoverGraphql("q", {}, "Bearer user")).rejects.toBeInstanceOf(HardcoverUnauthorizedError);
});

it("a user's token: 403 reports the missing scope without leaking the token", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "insufficient_scope", scope: "books:read" }, { status: 403 })));
  const err = await hardcoverGraphql("q", {}, "Bearer usersecret").catch((e: Error) => e);
  expect((err as Error).message).toContain("books:read");
  expect((err as Error).message).not.toContain("usersecret");
});

it("a user's token: a 429 without Retry-After defaults to 60s", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 429 })));
  await expect(hardcoverGraphql("q", {}, "Bearer user")).rejects.toMatchObject({ retryAfterSeconds: 60 });
});

it("a user's token: throws on GraphQL errors", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ errors: [{ message: "boom" }] })));
  await expect(hardcoverGraphql("q", {}, "Bearer user")).rejects.toThrow("boom");
});

it("sends a no-retry call through plain fetch, so a timed-out mutation is never repeated", async () => {
  const fetchMock = vi.fn(async () => Response.json({ data: { ok: 1 } }));
  vi.stubGlobal("fetch", fetchMock);
  try {
    expect(await hardcoverGraphql("mutation", {}, "Bearer k", { retry: false })).toEqual({ ok: 1 });
    expect(fetchWithTimeout).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBeInstanceOf(AbortSignal);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("lookupByIsbn returns the book's slug", async () => {
  const withSlug = { ok: true, json: async () => ({ data: { editions: [{ book: { slug: "dune", rating: 4, ratings_count: 10, user_books: [] } }] } }) } as unknown as Response;
  vi.mocked(fetchWithTimeout).mockResolvedValueOnce(withSlug);
  expect((await lookupByIsbn("1"))?.slug).toBe("dune");
  vi.mocked(fetchWithTimeout).mockResolvedValueOnce(match);
  expect((await lookupByIsbn("1"))?.slug).toBeNull();
});

it("maps a no-retry 429 the same way", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429, headers: { "Retry-After": "4" } })));
  try {
    await expect(hardcoverGraphql("mutation", {}, "Bearer k", { retry: false })).rejects.toMatchObject({ retryAfterSeconds: 4 });
  } finally {
    vi.unstubAllGlobals();
  }
});
