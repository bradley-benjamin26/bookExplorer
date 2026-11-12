import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeAccountStore, createOlSession, createSession, deleteOlSession, deleteSession, getOlSession, getSession, openAccountStore, updateOlCookie,
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
    savePending("s", { verifier: "v", returnTo: "/r", bindingHash: "h" });
    expect(takePending("s")).toEqual({ verifier: "v", returnTo: "/r", bindingHash: "h" });
    expect(takePending("s")).toBeNull();
  });
  it("drops the legacy oauth_pending table", () => {
    openAccountStore(":memory:");
    openAccountStore(":memory:");
  });
  it("takePending expires after 10 minutes", () => {
    vi.useFakeTimers();
    savePending("s", { verifier: "v", returnTo: "/r", bindingHash: "h" });
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
  it("getSession forgets a session 90 days after it was created", () => {
    vi.useFakeTimers();
    createSession("t", session);
    vi.setSystemTime(Date.now() + 90 * 864e5 + 1);
    expect(getSession("t")).toBeNull();
  });
  it("refreshing tokens doesn't extend a session", () => {
    vi.useFakeTimers();
    createSession("t", session);
    vi.setSystemTime(Date.now() + 89 * 864e5);
    updateTokens("t", { accessToken: "a2", refreshToken: "r2", expiresAt: 2000 });
    expect(getSession("t")).not.toBeNull();
    vi.setSystemTime(Date.now() + 864e5 + 1);
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
  it("saving a pending state or handoff purges expired rows", async () => {
    const path = `${process.env.TMPDIR ?? "/tmp"}/acct-purge-${Date.now()}.db`;
    closeAccountStore();
    openAccountStore(path);
    vi.useFakeTimers();
    savePending("old", { verifier: "v", returnTo: "/r", bindingHash: "h" });
    saveHandoff("old", "tok");
    vi.setSystemTime(Date.now() + 10 * 60_000 + 1);
    savePending("new", { verifier: "v", returnTo: "/r", bindingHash: "h" });
    saveHandoff("new", "tok");
    closeAccountStore();
    const { createRequire } = await import("node:module");
    const sqlite = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
    const raw = new sqlite.DatabaseSync(path);
    const counts = ["connect_pending", "handoffs"].map((t) => (raw.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n);
    raw.close();
    (await import("node:fs")).rmSync(path);
    expect(counts).toEqual([1, 1]);
    openAccountStore(":memory:");
  });
  it("getSession deletes and returns null for a row sealed with another key", () => {
    createSession("t", session);
    vi.stubEnv("HARDCOVER_TOKEN_KEY", Buffer.alloc(32, 9).toString("base64"));
    expect(getSession("t")).toBeNull();
    vi.stubEnv("HARDCOVER_TOKEN_KEY", Buffer.alloc(32, 7).toString("base64"));
    expect(getSession("t")).toBeNull();
  });

  it("getSession on an unknown token → null", () => expect(getSession("nope")).toBeNull());
  describe("Open Library sessions", () => {
    const ol = { username: "ada", accessKey: "AKEY", secretKey: "SKEY", cookie: "session=abc" };
    it("round-trips and deletes", () => {
      createOlSession("t", ol);
      expect(getOlSession("t")).toEqual(ol);
      deleteOlSession("t");
      expect(getOlSession("t")).toBeNull();
    });
    it("never stores Open Library keys or cookies in plaintext", async () => {
      const dir = mkdtempSync(join(tmpdir(), "acct-ol-"));
      const path = join(dir, "a.db");
      closeAccountStore();
      openAccountStore(path);
      createOlSession("t", ol);
      closeAccountStore();
      const { createRequire } = await import("node:module");
      const sqlite = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
      const raw = new sqlite.DatabaseSync(path);
      const dump = JSON.stringify(raw.prepare("SELECT * FROM ol_sessions").all());
      raw.close();
      rmSync(dir, { recursive: true });
      for (const secret of ["AKEY", "SKEY", "session=abc"]) expect(dump).not.toContain(secret);
      openAccountStore(":memory:");
    });
    it("updateOlCookie replaces only the cookie", () => {
      createOlSession("t", ol);
      updateOlCookie("t", "session=new");
      expect(getOlSession("t")).toEqual({ ...ol, cookie: "session=new" });
    });
    it("getOlSession on an unknown token returns null", () => {
      expect(getOlSession("nope")).toBeNull();
    });
    it("expires after 90 days", () => {
      vi.useFakeTimers();
      createOlSession("t", ol);
      vi.setSystemTime(Date.now() + 90 * 24 * 60 * 60_000 + 1);
      expect(getOlSession("t")).toBeNull();
    });
    it("drops a row the current key can't unseal", () => {
      createOlSession("t", ol);
      vi.stubEnv("HARDCOVER_TOKEN_KEY", Buffer.alloc(32, 9).toString("base64"));
      vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(getOlSession("t")).toBeNull();
      vi.stubEnv("HARDCOVER_TOKEN_KEY", Buffer.alloc(32, 7).toString("base64"));
      expect(getOlSession("t")).toBeNull();
    });
  });
});
