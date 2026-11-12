import Fastify, { type InjectOptions } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/openLibraryAccount.js", () => {
  class OpenLibrarySignedOutError extends Error {}
  return {
    OpenLibrarySignedOutError,
    openLibraryEnabled: vi.fn(),
    connect: vi.fn(),
    asUser: vi.fn(),
    resolveMembers: vi.fn(),
    getOpenLibraryAccount: vi.fn(),
    disconnectOpenLibrary: vi.fn(),
  };
});
vi.mock("../sources/openLibraryUser.js", () => {
  class OpenLibraryAuthError extends Error {}
  class OpenLibraryRateLimitError extends Error {
    constructor(readonly retryAfterSeconds: number) {
      super("rl");
    }
  }
  return { OpenLibraryAuthError, OpenLibraryRateLimitError, myLists: vi.fn(), getList: vi.fn(), createList: vi.fn(), updateSeeds: vi.fn() };
});
import * as svc from "../services/openLibraryAccount.js";
import * as user from "../sources/openLibraryUser.js";
import { openLibraryRoutes } from "./openLibrary.js";

const m = vi.mocked(svc);
const u = vi.mocked(user);
const headers = { "x-openlibrary-session": "tok" };
const KEY_A = "abcd1234abcd1234";

async function call(opts: InjectOptions) {
  const app = Fastify();
  await app.register(openLibraryRoutes);
  const res = await app.inject(opts);
  await app.close();
  return res;
}

beforeEach(() => {
  vi.resetAllMocks();
  m.openLibraryEnabled.mockReturnValue(true);
  m.asUser.mockImplementation(async (_t, run) => run({ username: "ada", cookie: "session=c" }));
  m.getOpenLibraryAccount.mockReturnValue({ username: "ada" });
});

describe("open library routes", () => {
  it("503 on every route when the feature is off", async () => {
    m.openLibraryEnabled.mockReturnValue(false);
    for (const [method, url] of [
      ["POST", "/api/openlibrary/session"],
      ["GET", "/api/openlibrary/session"],
      ["DELETE", "/api/openlibrary/session"],
      ["GET", "/api/openlibrary/lists"],
      ["GET", "/api/openlibrary/lists/OL1L"],
      ["POST", "/api/openlibrary/lists"],
      ["POST", "/api/openlibrary/lists/OL1L/seeds"],
      ["DELETE", "/api/openlibrary/lists/OL1L/seeds?seed=/works/OL1W"],
    ] as const) {
      const res = await call({ method, url });
      expect(res.statusCode, url).toBe(503);
      expect(res.json()).toEqual({ error: "Open Library sign-in isn't set up on this server." });
    }
  });

  it("POST session returns a token, 400s on a malformed key and 401s on rejected keys", async () => {
    m.connect.mockResolvedValue({ token: "t", username: "ada" });
    const ok = await call({ method: "POST", url: "/api/openlibrary/session", payload: { access: KEY_A, secret: KEY_A } });
    expect(ok.json()).toEqual({ token: "t", username: "ada" });
    for (const payload of [{ access: "short", secret: KEY_A }, { access: KEY_A, secret: "bad key!bad key!" }, { access: KEY_A }]) {
      const res = await call({ method: "POST", url: "/api/openlibrary/session", payload });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "Enter both keys." });
    }
    m.connect.mockRejectedValue(new user.OpenLibraryAuthError("no"));
    const res = await call({ method: "POST", url: "/api/openlibrary/session", payload: { access: KEY_A, secret: KEY_A } });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Open Library didn't accept those keys. Check both and try again." });
  });

  it("GET session returns the account or 401; DELETE gives 204", async () => {
    m.getOpenLibraryAccount.mockReturnValueOnce({ username: "ada" }).mockReturnValueOnce(null);
    expect((await call({ method: "GET", url: "/api/openlibrary/session", headers })).json()).toEqual({ username: "ada" });
    expect((await call({ method: "GET", url: "/api/openlibrary/session", headers })).statusCode).toBe(401);
    expect((await call({ method: "DELETE", url: "/api/openlibrary/session", headers })).statusCode).toBe(204);
    expect(m.disconnectOpenLibrary).toHaveBeenCalledWith("tok");
  });

  it("lists read with the session's username", async () => {
    u.myLists.mockResolvedValue([{ id: "OL1L", name: "x", seedCount: 1 }]);
    const res = await call({ method: "GET", url: "/api/openlibrary/lists", headers });
    expect(res.json()).toEqual([{ id: "OL1L", name: "x", seedCount: 1 }]);
    expect(u.myLists).toHaveBeenCalledWith("ada");
  });

  it("GET list 404s when missing and 400s on a malformed id", async () => {
    u.getList.mockResolvedValue(null);
    expect((await call({ method: "GET", url: "/api/openlibrary/lists/OL1L", headers })).statusCode).toBe(404);
    expect((await call({ method: "GET", url: "/api/openlibrary/lists/nope", headers })).statusCode).toBe(400);
  });

  it("POST lists validates name and description, then creates", async () => {
    u.createList.mockResolvedValue("OL5L");
    const bad = await call({ method: "POST", url: "/api/openlibrary/lists", headers, payload: { name: "x".repeat(101) } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toEqual({ error: "A list needs a name up to 100 characters and a description up to 1000." });
    const ok = await call({ method: "POST", url: "/api/openlibrary/lists", headers, payload: { name: " Mine ", description: "d" } });
    expect(ok.json()).toEqual({ id: "OL5L" });
    expect(u.createList).toHaveBeenCalledWith("ada", { name: "Mine", description: "d" }, "session=c");
  });

  it("adding members makes one updateSeeds call and reports misses", async () => {
    m.resolveMembers.mockResolvedValue({ added: [{ type: "work", id: "OL1W", seed: "/works/OL1W" }], missing: [{ type: "book", id: "9780000000002" }] });
    const res = await call({
      method: "POST", url: "/api/openlibrary/lists/OL9L/seeds", headers,
      payload: { members: [{ type: "work", id: "OL1W" }, { type: "book", id: "9780000000002" }] },
    });
    expect(res.json()).toEqual({ added: [{ type: "work", id: "OL1W", seed: "/works/OL1W" }], missing: [{ type: "book", id: "9780000000002" }] });
    expect(u.updateSeeds).toHaveBeenCalledTimes(1);
    expect(u.updateSeeds).toHaveBeenCalledWith("ada", "OL9L", { add: ["/works/OL1W"], remove: [] }, "session=c");
  });

  it("skips updateSeeds when every member is missing", async () => {
    m.resolveMembers.mockResolvedValue({ added: [], missing: [{ type: "book", id: "9780000000002" }] });
    await call({ method: "POST", url: "/api/openlibrary/lists/OL9L/seeds", headers, payload: { members: [{ type: "book", id: "9780000000002" }] } });
    expect(u.updateSeeds).not.toHaveBeenCalled();
    expect(m.asUser).not.toHaveBeenCalled();
  });

  it("adding members without a session is a 401 before any lookup", async () => {
    m.getOpenLibraryAccount.mockReturnValue(null);
    const res = await call({ method: "POST", url: "/api/openlibrary/lists/OL9L/seeds", headers, payload: { members: [{ type: "book", id: "9780000000002" }] } });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Connect your Open Library account again." });
    expect(m.resolveMembers).not.toHaveBeenCalled();
    expect(m.getOpenLibraryAccount).toHaveBeenCalledWith("tok");
  });

  it("uppercases a lowercase ISBN-10 check digit before resolving", async () => {
    m.resolveMembers.mockResolvedValue({ added: [], missing: [] });
    await call({ method: "POST", url: "/api/openlibrary/lists/OL9L/seeds", headers, payload: { members: [{ type: "book", id: "080442957x" }] } });
    expect(m.resolveMembers).toHaveBeenCalledWith([{ type: "book", id: "080442957X" }]);
  });

  it("rejects malformed list ids, seeds and members with 400", async () => {
    const post = (url: string, members: unknown) => call({ method: "POST", url, headers, payload: { members } });
    expect((await post("/api/openlibrary/lists/bad/seeds", [{ type: "work", id: "OL1W" }])).statusCode).toBe(400);
    expect((await post("/api/openlibrary/lists/OL1L/seeds", [])).statusCode).toBe(400);
    expect((await post("/api/openlibrary/lists/OL1L/seeds", [{ type: "work", id: "../x" }])).statusCode).toBe(400);
    expect((await post("/api/openlibrary/lists/OL1L/seeds", [{ type: "book", id: "OL1M" }])).statusCode).toBe(400);
    expect((await post("/api/openlibrary/lists/OL1L/seeds", [{ type: "toString", id: "x" }])).statusCode).toBe(400);
    expect((await post("/api/openlibrary/lists/OL1L/seeds", Array(101).fill({ type: "work", id: "OL1W" }))).statusCode).toBe(400);
    const del = (url: string) => call({ method: "DELETE", url, headers });
    expect((await del("/api/openlibrary/lists/bad/seeds?seed=/works/OL1W")).statusCode).toBe(400);
    expect((await del("/api/openlibrary/lists/OL1L/seeds?seed=/subjects/x")).statusCode).toBe(400);
    expect((await del("/api/openlibrary/lists/OL1L/seeds")).statusCode).toBe(400);
    expect(u.updateSeeds).not.toHaveBeenCalled();
  });

  it("DELETE seed removes it and returns 204", async () => {
    const res = await call({ method: "DELETE", url: "/api/openlibrary/lists/OL1L/seeds?seed=/works/OL1W", headers });
    expect(res.statusCode).toBe(204);
    expect(u.updateSeeds).toHaveBeenCalledWith("ada", "OL1L", { add: [], remove: ["/works/OL1W"] }, "session=c");
  });

  it("maps a signed-out error to 401 and a rate limit to 429 with Retry-After", async () => {
    m.asUser.mockRejectedValueOnce(new svc.OpenLibrarySignedOutError("x"));
    const out = await call({ method: "GET", url: "/api/openlibrary/lists", headers });
    expect(out.statusCode).toBe(401);
    expect(out.json()).toEqual({ error: "Connect your Open Library account again." });
    m.asUser.mockRejectedValueOnce(new user.OpenLibraryRateLimitError(30));
    const rl = await call({ method: "GET", url: "/api/openlibrary/lists", headers });
    expect(rl.statusCode).toBe(429);
    expect(rl.headers["retry-after"]).toBe("30");
    expect(rl.json()).toEqual({ error: "Open Library is busy. Try again in a minute.", retryAfterSeconds: 30 });
  });
});
