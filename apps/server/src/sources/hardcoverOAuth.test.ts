import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "../httpClient.js";
import { HARDCOVER_SCOPES, HardcoverAuthRevokedError, authorizeUrl, exchangeCode, fetchMe, newPkce, refreshTokens, revokeToken } from "./hardcoverOAuth.js";

vi.mock("../httpClient.js", () => ({ fetchWithTimeout: vi.fn() }));
const res = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const good = { access_token: "at", refresh_token: "rt", expires_in: 3600 };
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("MY_HARDCOVER_CLIENT_ID", "cid");
  vi.stubEnv("MY_HARDCOVER_CLIENT_SECRET", "secret");
  vi.stubEnv("HARDCOVER_REDIRECT_URI", "https://api.example/api/hardcover/callback");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(fetchWithTimeout).mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("challenge is base64url SHA-256 of the verifier", () => {
  const { verifier, challenge } = newPkce();
  expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
});

it("authorizeUrl carries every required param", () => {
  const u = new URL(authorizeUrl({ state: "s", challenge: "c" }));
  expect(u.origin + u.pathname).toBe("https://hardcover.app/oauth2/authorize");
  expect(Object.fromEntries(u.searchParams)).toMatchObject({ response_type: "code", client_id: "cid", redirect_uri: "https://api.example/api/hardcover/callback", state: "s", code_challenge: "c", code_challenge_method: "S256", scope: HARDCOVER_SCOPES });
  expect(HARDCOVER_SCOPES).not.toContain("write:social");
});

it("exchangeCode posts a form with Basic auth and returns expiresAt", async () => {
  fetchMock.mockResolvedValue(res(200, good));
  const before = Date.now();
  const t = await exchangeCode("the-code", "ver");
  expect(t).toMatchObject({ accessToken: "at", refreshToken: "rt" });
  expect(t.expiresAt).toBeGreaterThanOrEqual(before + 3_600_000);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://api.hardcover.app/oauth2/token");
  expect(init.headers.Authorization).toBe("Basic " + Buffer.from("cid:secret").toString("base64"));
  expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
  expect(init.signal).toBeInstanceOf(AbortSignal);
  const body = new URLSearchParams(init.body);
  expect(Object.fromEntries(body)).toMatchObject({ grant_type: "authorization_code", code: "the-code", code_verifier: "ver", redirect_uri: "https://api.example/api/hardcover/callback" });
  expect(fetchWithTimeout).not.toHaveBeenCalled();
});

it("refreshTokens sends no scope", async () => {
  fetchMock.mockResolvedValue(res(200, good));
  await refreshTokens("old");
  const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
  expect(Object.fromEntries(body)).toEqual({ grant_type: "refresh_token", refresh_token: "old" });
});

it("refreshTokens throws HardcoverAuthRevokedError on invalid_grant", async () => {
  fetchMock.mockResolvedValue(res(400, { error: "invalid_grant" }));
  await expect(refreshTokens("old")).rejects.toBeInstanceOf(HardcoverAuthRevokedError);
});

it("401 is revoked; other failures are plain errors without secrets", async () => {
  fetchMock.mockResolvedValueOnce(res(401, {}));
  await expect(refreshTokens("old-rt")).rejects.toBeInstanceOf(HardcoverAuthRevokedError);
  fetchMock.mockResolvedValueOnce(res(400, { error: "invalid_request" }));
  const e1 = await refreshTokens("old-rt").catch((e) => e);
  expect(e1).not.toBeInstanceOf(HardcoverAuthRevokedError);
  expect(e1.message).toContain("400");
  fetchMock.mockResolvedValueOnce(res(500, {}));
  const e2 = await refreshTokens("old-rt").catch((e) => e);
  expect(e2).not.toBeInstanceOf(HardcoverAuthRevokedError);
  expect(e2.message).toContain("500");
  expect(e2.message + e1.message).not.toMatch(/secret|old-rt/);
});

it("rejects a malformed token response", async () => {
  fetchMock.mockResolvedValueOnce(res(200, { ...good, expires_in: "3600" }));
  await expect(exchangeCode("c", "v")).rejects.toThrow();
  fetchMock.mockResolvedValueOnce(res(200, { access_token: "at", expires_in: 1 }));
  await expect(exchangeCode("c", "v")).rejects.toThrow();
});

it("revokeToken swallows network errors", async () => {
  fetchMock.mockRejectedValue(new Error("down"));
  await expect(revokeToken("t")).resolves.toBeUndefined();
});

it("revokeToken posts to the revoke endpoint", async () => {
  fetchMock.mockResolvedValue(res(200, {}));
  await revokeToken("t");
  expect(fetchMock.mock.calls[0][0]).toBe("https://api.hardcover.app/oauth2/revoke");
  expect(new URLSearchParams(fetchMock.mock.calls[0][1].body).get("token")).toBe("t");
});

it("fetchMe reads me[0] with a bearer token", async () => {
  vi.mocked(fetchWithTimeout).mockResolvedValue(res(200, { data: { me: [{ id: 7, username: "ann" }] } }));
  expect(await fetchMe("at")).toEqual({ id: 7, username: "ann" });
  const [url, init] = vi.mocked(fetchWithTimeout).mock.calls[0];
  expect(url).toBe("https://api.hardcover.app/v1/graphql");
  expect((init as any).headers.Authorization).toBe("Bearer at");
});

it("fetchMe throws on non-OK, GraphQL errors, and missing me[0]", async () => {
  vi.mocked(fetchWithTimeout).mockResolvedValueOnce(res(401, { error: "invalid_token" }));
  await expect(fetchMe("at")).rejects.toThrow();
  vi.mocked(fetchWithTimeout).mockResolvedValueOnce(res(200, { errors: [{ message: "x" }] }));
  await expect(fetchMe("at")).rejects.toThrow();
  vi.mocked(fetchWithTimeout).mockResolvedValueOnce(res(200, { data: { me: [] } }));
  await expect(fetchMe("at")).rejects.toThrow();
});
