import { describe, expect, it } from "vitest";
import { isPublicPath, isValidAppKey } from "./appAuth.js";

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

describe("isPublicPath", () => {
  it("allows /health (with or without a query) and /og/ pages", () => {
    expect(isPublicPath("/health")).toBe(true);
    expect(isPublicPath("/health?x=1")).toBe(true);
    expect(isPublicPath("/og/work/OL1W")).toBe(true);
    expect(isPublicPath("/og/work/OL1W?a=1")).toBe(true);
  });

  it("rejects everything else, including lookalikes", () => {
    for (const u of ["/api/works/OL1W", "/healthz", "/health/x", "/api/x?/og/", "/api/x?y=/health", "//og/x", "/og", "/ogx/y", "/x/og/y", "", "og/x"]) {
      expect(isPublicPath(u)).toBe(false);
    }
  });
});
