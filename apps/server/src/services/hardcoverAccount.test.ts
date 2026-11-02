import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeAccountStore, createSession, getSession, openAccountStore } from "../accountStore.js";
import * as oauth from "../sources/hardcoverOAuth.js";
import {
  ExpiredCallbackError, InvalidReturnUrlError, accountEnabled, completeConnect, disconnect, forgetSession,
  getAccount, redeemHandoff, startConnect, userAuthorization,
} from "./hardcoverAccount.js";

vi.mock("../sources/hardcoverOAuth.js", async () => {
  const actual = await vi.importActual<typeof import("../sources/hardcoverOAuth.js")>("../sources/hardcoverOAuth.js");
  return {
    HardcoverAuthRevokedError: actual.HardcoverAuthRevokedError,
    HARDCOVER_ISSUER: actual.HARDCOVER_ISSUER,
    HARDCOVER_SCOPES: actual.HARDCOVER_SCOPES,
    newPkce: vi.fn(() => ({ verifier: "ver", challenge: "chal" })),
    authorizeUrl: vi.fn(({ state }: { state: string }) => `https://api.hardcover.app/oauth/authorize?state=${state}`),
    exchangeCode: vi.fn(),
    refreshTokens: vi.fn(),
    revokeToken: vi.fn(async () => {}),
    fetchMe: vi.fn(),
  };
});

const RETURN = "bookexplorer://hardcover-connected";
const tokens = (n: number, expiresAt = Date.now() + 7 * 864e5) => ({ accessToken: `hc_at_${n}`, refreshToken: `hc_rt_${n}`, expiresAt });
const stateOf = (url: string) => new URL(url).searchParams.get("state")!;

async function connect(): Promise<string> {
  vi.mocked(oauth.exchangeCode).mockResolvedValue(tokens(1));
  vi.mocked(oauth.fetchMe).mockResolvedValue({ id: 7, username: "ann" });
  const url = await completeConnect({ code: "c", state: stateOf(startConnect(RETURN)), iss: oauth.HARDCOVER_ISSUER });
  return new URL(url.replace("bookexplorer://", "http://x/")).searchParams.get("handoff")!;
}

beforeEach(() => {
  vi.stubEnv("HARDCOVER_TOKEN_KEY", Buffer.alloc(32, 7).toString("base64"));
  openAccountStore(":memory:");
});
afterEach(() => {
  closeAccountStore();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("hardcoverAccount", () => {
  it("accountEnabled needs all five env vars", () => {
    expect(accountEnabled()).toBe(false);
    for (const k of ["MY_HARDCOVER_CLIENT_ID", "MY_HARDCOVER_CLIENT_SECRET", "HARDCOVER_REDIRECT_URI", "ACCOUNT_DB_PATH"]) vi.stubEnv(k, "x");
    expect(accountEnabled()).toBe(true);
  });

  it("startConnect rejects a return URL outside the allowlist", () =>
    expect(() => startConnect("https://evil.example/x")).toThrow(InvalidReturnUrlError));

  it("HARDCOVER_RETURN_URLS overrides the default allowlist, trimmed", () => {
    vi.stubEnv("HARDCOVER_RETURN_URLS", " https://a.example/ , https://b.example/ ");
    expect(() => startConnect("https://b.example/x")).not.toThrow();
    expect(() => startConnect(RETURN)).toThrow(InvalidReturnUrlError);
  });

  it("ignores return prefixes that could match someone else's address", () => {
    vi.stubEnv("HARDCOVER_RETURN_URLS", "exp://,https://app.test,https://ok.test/,myapp://");
    expect(() => startConnect("exp://evil.test/--/x")).toThrow(InvalidReturnUrlError);
    expect(() => startConnect("https://app.test.evil.com/")).toThrow(InvalidReturnUrlError);
    expect(startConnect("https://ok.test/hc")).toBeTruthy();
    expect(startConnect("myapp://cb")).toBeTruthy();
  });

  it("completeConnect with an unknown state throws ExpiredCallbackError", async () =>
    expect(completeConnect({ code: "c", state: "nope", iss: oauth.HARDCOVER_ISSUER })).rejects.toThrow(ExpiredCallbackError));

  it("completeConnect rejects the wrong issuer without exchanging the code", async () => {
    const state = stateOf(startConnect(RETURN));
    expect(await completeConnect({ code: "c", state, iss: "https://evil.example" })).toBe(`${RETURN}?error=failed`);
    expect(oauth.exchangeCode).not.toHaveBeenCalled();
  });

  it("completeConnect maps error=access_denied to ?error=denied", async () => {
    const state = stateOf(startConnect(RETURN));
    expect(await completeConnect({ error: "access_denied", state, iss: oauth.HARDCOVER_ISSUER })).toBe(`${RETURN}?error=denied`);
  });

  it("completeConnect returns ?error=failed when the exchange throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(oauth.exchangeCode).mockRejectedValue(new Error("boom"));
    const state = stateOf(startConnect(`${RETURN}?a=1`));
    expect(await completeConnect({ code: "c", state, iss: oauth.HARDCOVER_ISSUER })).toBe(`${RETURN}?a=1&error=failed`);
  });

  it("full flow: handoff redeems once to a session that authorizes", async () => {
    const code = await connect();
    const out = redeemHandoff(code)!;
    expect(out.username).toBe("ann");
    expect(await userAuthorization(out.token)).toBe("Bearer hc_at_1");
    expect(getAccount(out.token)).toEqual({ username: "ann" });
    expect(redeemHandoff(code)).toBeNull();
  });

  it("userAuthorization returns null for a lapsed session", async () => {
    vi.useFakeTimers();
    const out = redeemHandoff(await connect())!;
    vi.setSystemTime(Date.now() + 90 * 864e5 + 1);
    expect(await userAuthorization(out.token)).toBeNull();
  });

  it("userAuthorization is null for missing, non-string or unknown tokens", async () => {
    expect(await userAuthorization(undefined)).toBeNull();
    expect(await userAuthorization(5)).toBeNull();
    expect(await userAuthorization("unknown")).toBeNull();
  });

  it("two concurrent calls on an expiring session refresh once", async () => {
    createSession("tok", { ...tokens(1, Date.now() + 60_000), hardcoverUserId: 7, username: "ann" });
    vi.mocked(oauth.refreshTokens).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 1));
      return tokens(2);
    });
    const [a, b] = await Promise.all([userAuthorization("tok"), userAuthorization("tok")]);
    expect(a).toBe("Bearer hc_at_2");
    expect(b).toBe("Bearer hc_at_2");
    expect(oauth.refreshTokens).toHaveBeenCalledTimes(1);
    expect(getSession("tok")?.refreshToken).toBe("hc_rt_2");
  });

  it("a revoked refresh token deletes the session and returns null", async () => {
    createSession("tok", { ...tokens(1, Date.now() + 60_000), hardcoverUserId: 7, username: "ann" });
    vi.mocked(oauth.refreshTokens).mockRejectedValue(new oauth.HardcoverAuthRevokedError("revoked"));
    expect(await userAuthorization("tok")).toBeNull();
    expect(getSession("tok")).toBeNull();
  });

  it("another refresh failure rethrows, keeps the session and clears the lock", async () => {
    createSession("tok", { ...tokens(1, Date.now() + 60_000), hardcoverUserId: 7, username: "ann" });
    vi.mocked(oauth.refreshTokens).mockRejectedValueOnce(new Error("503"));
    await expect(userAuthorization("tok")).rejects.toThrow("503");
    expect(getSession("tok")).not.toBeNull();
    vi.mocked(oauth.refreshTokens).mockResolvedValueOnce(tokens(2));
    expect(await userAuthorization("tok")).toBe("Bearer hc_at_2");
  });

  it("forgetSession deletes the session", () => {
    createSession("tok", { ...tokens(1), hardcoverUserId: 7, username: "ann" });
    forgetSession("tok");
    expect(getSession("tok")).toBeNull();
  });

  it("disconnect revokes and deletes", async () => {
    createSession("tok", { ...tokens(1), hardcoverUserId: 7, username: "ann" });
    await disconnect("tok");
    expect(oauth.revokeToken).toHaveBeenCalledWith("hc_rt_1");
    expect(getSession("tok")).toBeNull();
  });
});
