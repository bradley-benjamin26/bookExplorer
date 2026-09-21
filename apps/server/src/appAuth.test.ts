import { describe, expect, it } from "vitest";
import { isValidAppKey } from "./appAuth.js";

describe("isValidAppKey", () => {
  it("accepts a header that matches the expected secret exactly", () => {
    expect(isValidAppKey("correct-secret", "correct-secret")).toBe(true);
  });

  it("rejects a header that doesn't match", () => {
    expect(isValidAppKey("wrong-secret", "correct-secret")).toBe(false);
  });

  it("rejects a header of a different length instead of throwing", () => {
    // timingSafeEqual throws on mismatched buffer lengths if called directly on them.
    expect(isValidAppKey("short", "a-much-longer-correct-secret")).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(isValidAppKey(undefined, "correct-secret")).toBe(false);
  });

  it("rejects a non-string header value", () => {
    expect(isValidAppKey(["correct-secret"], "correct-secret")).toBe(false);
    expect(isValidAppKey(42, "correct-secret")).toBe(false);
  });

  it("rejects an empty string against a non-empty secret", () => {
    expect(isValidAppKey("", "correct-secret")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(isValidAppKey("Correct-Secret", "correct-secret")).toBe(false);
  });
});
