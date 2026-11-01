import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeAccountStore, createSession, deleteSession, getSession, openAccountStore,
  saveHandoff, savePending, takeHandoff, takePending, updateTokens,
} from "./accountStore.js";

const session = { hardcoverUserId: 5, username: "ann", accessToken: "hc_at_x", refreshToken: "hc_rt_x", expiresAt: 1000 };

describe("accountStore", () => {
  beforeEach(() => {
    vi.stubEnv("HARDCOVER_TOKEN_KEY", Buffer.alloc(32, 7).toString("base64"));
    openAccountStore(":memory:");
  });
  afterEach(() => {
    closeAccountStore();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("takePending is single-use", () => {
    savePending("s", { verifier: "v", returnTo: "/r" });
    expect(takePending("s")).toEqual({ verifier: "v", returnTo: "/r" });
    expect(takePending("s")).toBeNull();
  });
  it("takePending expires after 10 minutes", () => {
    vi.useFakeTimers();
    savePending("s", { verifier: "v", returnTo: "/r" });
    vi.setSystemTime(Date.now() + 10 * 60_000 + 1);
    expect(takePending("s")).toBeNull();
  });
  it("takeHandoff is single-use and expires after 2 minutes", () => {
    vi.useFakeTimers();
    saveHandoff("c", "tok");
    expect(takeHandoff("c")).toBe("tok");
    expect(takeHandoff("c")).toBeNull();
    saveHandoff("c2", "tok");
    vi.setSystemTime(Date.now() + 2 * 60_000 + 1);
    expect(takeHandoff("c2")).toBeNull();
  });
  it("round-trips a session and deletes it", () => {
    createSession("t", session);
    expect(getSession("t")).toEqual(session);
    deleteSession("t");
    expect(getSession("t")).toBeNull();
  });
  it("never stores tokens in plaintext", async () => {
    const path = `${process.env.TMPDIR ?? "/tmp"}/acct-${Date.now()}.db`;
    closeAccountStore();
    openAccountStore(path);
    createSession("t", session);
    saveHandoff("c", "sessiontok");
    closeAccountStore();
    const { createRequire } = await import("node:module");
    const sqlite = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
    const raw = new sqlite.DatabaseSync(path);
    const dump = JSON.stringify([
      raw.prepare("SELECT * FROM sessions").all(),
      raw.prepare("SELECT * FROM handoffs").all(),
    ]);
    raw.close();
    (await import("node:fs")).rmSync(path);
    expect(dump).not.toContain("hc_at_x");
    expect(dump).not.toContain("hc_rt_x");
    expect(dump).not.toContain("sessiontok");
    openAccountStore(":memory:");
  });
  it("updateTokens replaces both tokens and expiry", () => {
    createSession("t", session);
    updateTokens("t", { accessToken: "a2", refreshToken: "r2", expiresAt: 2000 });
    expect(getSession("t")).toMatchObject({ accessToken: "a2", refreshToken: "r2", expiresAt: 2000, username: "ann" });
  });
  it("getSession on an unknown token → null", () => expect(getSession("nope")).toBeNull());
});
