import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./api/client";
import { retryRateLimited } from "./listSync";

vi.mock("@react-native-async-storage/async-storage", () => import("./test/asyncStorageMock"));
vi.mock("./api/client", () => ({
  ApiError: class extends Error {
    constructor(message: string, public status: number, public retryAfterSeconds?: number) {
      super(message);
    }
  },
}));

describe("retryRateLimited", () => {
  it("waits 60 seconds when there's no Retry-After, then returns the result", async () => {
    const run = vi.fn().mockRejectedValueOnce(new ApiError("slow", 429)).mockResolvedValue("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);
    expect(await retryRateLimited(run, sleep, () => {})).toBe("ok");
    expect(sleep).toHaveBeenCalledWith(60_000);
  });

  it("rethrows other errors at once and gives up after five retries", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(retryRateLimited(vi.fn().mockRejectedValue(new ApiError("boom", 500)), sleep, () => {})).rejects.toThrow("boom");
    expect(sleep).not.toHaveBeenCalled();
    const busy = vi.fn().mockRejectedValue(new ApiError("slow", 429, 1));
    await expect(retryRateLimited(busy, sleep, () => {})).rejects.toThrow("slow");
    expect(busy).toHaveBeenCalledTimes(6);
  });
});
