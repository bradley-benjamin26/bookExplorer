import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchBookByIsbn } = vi.hoisted(() => ({ fetchBookByIsbn: vi.fn() }));
vi.mock("./client", () => ({
  fetchBookByIsbn,
  ApiError: class extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  },
}));

import { fetchBookWithAlternate } from "./bookLookup";
import { ApiError } from "./client";

const notFound = (m: string) => new ApiError(m, 404);

describe("fetchBookWithAlternate", () => {
  beforeEach(() => fetchBookByIsbn.mockReset());

  it("retries the other ISBN form after a 404", async () => {
    fetchBookByIsbn.mockRejectedValueOnce(notFound("a")).mockResolvedValueOnce({ title: "T" });
    await expect(fetchBookWithAlternate("0306406152")).resolves.toEqual({ title: "T" });
    expect(fetchBookByIsbn).toHaveBeenLastCalledWith("9780306406157");
  });

  it("rethrows the original error when the retry also 404s", async () => {
    const first = notFound("first");
    fetchBookByIsbn.mockRejectedValueOnce(first).mockRejectedValueOnce(notFound("second"));
    await expect(fetchBookWithAlternate("0306406152")).rejects.toBe(first);
    expect(fetchBookByIsbn).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-404 errors", async () => {
    const err = new ApiError("boom", 500);
    fetchBookByIsbn.mockRejectedValueOnce(err);
    await expect(fetchBookWithAlternate("0306406152")).rejects.toBe(err);
    expect(fetchBookByIsbn).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 979 ISBN, which has no alternate", async () => {
    const err = notFound("x");
    fetchBookByIsbn.mockRejectedValueOnce(err);
    await expect(fetchBookWithAlternate("9791034365463")).rejects.toBe(err);
    expect(fetchBookByIsbn).toHaveBeenCalledTimes(1);
  });
});
