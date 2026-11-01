import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "../httpClient.js";
import { lookupByAnyIsbn } from "./hardcover.js";

vi.mock("../httpClient.js", () => ({ fetchWithTimeout: vi.fn() }));
const noMatch = { ok: true, json: async () => ({ data: { editions: [] } }) } as unknown as Response;
const match = { ok: true, json: async () => ({ data: { editions: [{ book: { rating: 4, ratings_count: 10, user_books: [] } }] } }) } as unknown as Response;
const isbns = ["1", "2", "3", "4", "5", "6", "7", "8"];

beforeEach(() => {
  vi.stubEnv("HARDCOVER_API_KEY", "k");
  vi.mocked(fetchWithTimeout).mockReset();
});
afterEach(() => vi.unstubAllEnvs());

it("stops after 5 ISBNs when none match", async () => {
  vi.mocked(fetchWithTimeout).mockResolvedValue(noMatch);
  expect(await lookupByAnyIsbn(isbns)).toBeNull();
  expect(fetchWithTimeout).toHaveBeenCalledTimes(5);
});

it("still finds a match on the 5th ISBN", async () => {
  vi.mocked(fetchWithTimeout).mockResolvedValueOnce(noMatch).mockResolvedValueOnce(noMatch).mockResolvedValueOnce(noMatch).mockResolvedValueOnce(noMatch).mockResolvedValueOnce(match);
  expect((await lookupByAnyIsbn(isbns))?.rating).toBe(4);
});
