import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { open, randomToken, seal, sha256 } from "./secretBox.js";

describe("secretBox", () => {
  beforeEach(() => vi.stubEnv("HARDCOVER_TOKEN_KEY", Buffer.alloc(32, 7).toString("base64")));
  afterEach(() => vi.unstubAllEnvs());

  it("round-trips", () => expect(open(seal("hc_at_x"))).toBe("hc_at_x"));
  it("uses a fresh IV per call", () => expect(seal("a")).not.toBe(seal("a")));
  it("rejects a tampered ciphertext", () => {
    const s = seal("a");
    expect(() => open(s.slice(0, -2) + "AA")).toThrow();
  });
  it("rejects the wrong key", () => {
    const s = seal("a");
    vi.stubEnv("HARDCOVER_TOKEN_KEY", Buffer.alloc(32, 8).toString("base64"));
    expect(() => open(s)).toThrow();
  });
  it("rejects a key that isn't 32 bytes", () => {
    vi.stubEnv("HARDCOVER_TOKEN_KEY", "c2hvcnQ=");
    expect(() => seal("a")).toThrow(/32 bytes/);
  });
  it("hashes and generates tokens", () => {
    expect(sha256("a")).toMatch(/^[0-9a-f]{64}$/);
    expect(randomToken()).not.toBe(randomToken());
  });
});
