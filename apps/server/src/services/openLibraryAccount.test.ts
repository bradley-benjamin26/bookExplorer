import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeAccountStore, getOlSession, openAccountStore } from "../accountStore.js";
import { OpenLibraryAuthError, login } from "../sources/openLibraryUser.js";
import { OpenLibrarySignedOutError, asUser, connect, disconnectOpenLibrary, getOpenLibraryAccount, openLibraryEnabled } from "./openLibraryAccount.js";

vi.mock("../sources/openLibraryUser.js", async () => {
  const actual = await vi.importActual<typeof import("../sources/openLibraryUser.js")>("../sources/openLibraryUser.js");
  return { OpenLibraryAuthError: actual.OpenLibraryAuthError, login: vi.fn() };
});

const KEYS = ["abcd1234abcd1234", "wxyz9876wxyz9876"] as const;

beforeEach(() => {
  vi.stubEnv("HARDCOVER_TOKEN_KEY", Buffer.alloc(32, 7).toString("base64"));
  openAccountStore(":memory:");
  vi.mocked(login).mockResolvedValue({ cookie: "session=old", username: "ada" });
});
afterEach(() => {
  closeAccountStore();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("openLibraryAccount", () => {
  it("is enabled only with the token key and an open store", () => {
    expect(openLibraryEnabled()).toBe(true);
    vi.stubEnv("HARDCOVER_TOKEN_KEY", "");
    expect(openLibraryEnabled()).toBe(false);
  });

  it("connect stores a session and getOpenLibraryAccount/disconnect use it", async () => {
    const { token, username } = await connect(...KEYS);
    expect(username).toBe("ada");
    expect(getOpenLibraryAccount(token)).toEqual({ username: "ada" });
    disconnectOpenLibrary(token);
    expect(getOpenLibraryAccount(token)).toBeNull();
  });

  it("connect stores nothing when Open Library rejects the keys", async () => {
    vi.mocked(login).mockRejectedValue(new OpenLibraryAuthError("no"));
    await expect(connect(...KEYS)).rejects.toBeInstanceOf(OpenLibraryAuthError);
    expect(getOpenLibraryAccount("anything")).toBeNull();
  });

  it("asUser logs in again once on an expired cookie and keeps the new cookie", async () => {
    const { token } = await connect(...KEYS);
    vi.mocked(login).mockClear();
    vi.mocked(login).mockResolvedValue({ cookie: "session=new", username: "ada" });
    const run = vi.fn().mockRejectedValueOnce(new OpenLibraryAuthError("expired")).mockResolvedValueOnce("ok");
    expect(await asUser(token, run)).toBe("ok");
    expect(login).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenLastCalledWith({ username: "ada", cookie: "session=new" });
    expect(getOlSession(token)?.cookie).toBe("session=new");
  });

  it("asUser deletes the session when the stored keys stop working", async () => {
    const { token } = await connect(...KEYS);
    vi.mocked(login).mockRejectedValue(new OpenLibraryAuthError("no"));
    const run = vi.fn().mockRejectedValue(new OpenLibraryAuthError("expired"));
    await expect(asUser(token, run)).rejects.toBeInstanceOf(OpenLibrarySignedOutError);
    expect(getOlSession(token)).toBeNull();
  });

  it("asUser signs out when the retried call is still refused", async () => {
    const { token } = await connect(...KEYS);
    const run = vi.fn().mockRejectedValue(new OpenLibraryAuthError("expired"));
    await expect(asUser(token, run)).rejects.toBeInstanceOf(OpenLibrarySignedOutError);
    expect(run).toHaveBeenCalledTimes(2);
    expect(getOlSession(token)).toBeNull();
  });

  it("asUser keeps the session when the re-login fails for another reason", async () => {
    const { token } = await connect(...KEYS);
    vi.mocked(login).mockRejectedValue(new Error("network"));
    await expect(asUser(token, vi.fn().mockRejectedValue(new OpenLibraryAuthError("x")))).rejects.toThrow("network");
    expect(getOlSession(token)).not.toBeNull();
  });

  it("asUser passes other errors through without logging in", async () => {
    const { token } = await connect(...KEYS);
    vi.mocked(login).mockClear();
    await expect(asUser(token, vi.fn().mockRejectedValue(new Error("boom")))).rejects.toThrow("boom");
    expect(login).not.toHaveBeenCalled();
  });

  it("asUser with no or unknown session throws OpenLibrarySignedOutError without calling run", async () => {
    const run = vi.fn();
    await expect(asUser(undefined, run)).rejects.toBeInstanceOf(OpenLibrarySignedOutError);
    await expect(asUser("nope", run)).rejects.toBeInstanceOf(OpenLibrarySignedOutError);
    expect(run).not.toHaveBeenCalled();
  });
});
