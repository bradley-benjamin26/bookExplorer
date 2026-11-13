import { beforeEach, describe, expect, it, vi } from "vitest";

const ol = vi.hoisted(() => ({ token: null as string | null, clear: vi.fn() }));
const rn = vi.hoisted(() => ({ Platform: { OS: "ios" } }));
vi.mock("react-native", () => rn);
vi.mock("expo-constants", () => ({ default: { expoConfig: {} } }));
vi.mock("../hardcoverSession", () => ({ getSessionToken: () => null, clearSession: vi.fn() }));
vi.mock("../openLibrarySession", () => ({ getOpenLibrarySessionToken: () => ol.token, clearOpenLibrarySession: ol.clear }));

const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("Open Library session handling in the client", () => {
  beforeEach(() => {
    ol.token = null;
    ol.clear.mockClear();
    rn.Platform.OS = "ios";
  });

  it("web sends no session header, includes cookies, and asks connect for a cookie", async () => {
    rn.Platform.OS = "web";
    ol.token = "cookie";
    const f = reply(200, { token: "t", username: "u" });
    vi.stubGlobal("fetch", f);
    const { fetchOpenLibraryAccount, connectOpenLibrary } = await import("./client");
    await fetchOpenLibraryAccount();
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.credentials).toBe("include");
    expect((init.headers as Record<string, string> | undefined)?.["X-OpenLibrary-Session"]).toBeUndefined();
    await connectOpenLibrary("a", "b");
    const body = JSON.parse((f.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(body.cookie).toBe(true);
  });

  it("native leaves credentials alone and asks connect for no cookie", async () => {
    const f = reply(200, { token: "t", username: "u" });
    vi.stubGlobal("fetch", f);
    const { connectOpenLibrary } = await import("./client");
    await connectOpenLibrary("a", "b");
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.credentials).toBeUndefined();
    expect(JSON.parse(init.body as string).cookie).toBe(false);
  });

  it("a 401 from an openlibrary path clears the session and throws ApiError 401", async () => {
    vi.stubGlobal("fetch", reply(401, { error: "Connect your Open Library account again." }));
    const { fetchOpenLibraryAccount, ApiError } = await import("./client");
    const err = await fetchOpenLibraryAccount().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(ol.clear).toHaveBeenCalledTimes(1);
  });

  it("a 401 from another path leaves the Open Library session alone", async () => {
    vi.stubGlobal("fetch", reply(401, { error: "nope" }));
    const { sendJson } = await import("./client");
    await sendJson("POST", "/api/other", {}).catch(() => {});
    expect(ol.clear).not.toHaveBeenCalled();
  });

  it("sends X-OpenLibrary-Session when a token exists", async () => {
    ol.token = "tok";
    const f = reply(200, { username: "u" });
    vi.stubGlobal("fetch", f);
    const { fetchOpenLibraryAccount } = await import("./client");
    await fetchOpenLibraryAccount();
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)["X-OpenLibrary-Session"]).toBe("tok");
  });
});
