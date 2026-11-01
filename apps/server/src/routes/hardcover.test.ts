import Fastify, { type InjectOptions } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/hardcoverAccount.js", () => {
  class InvalidReturnUrlError extends Error {}
  class ExpiredCallbackError extends Error {}
  return {
    InvalidReturnUrlError,
    ExpiredCallbackError,
    accountEnabled: vi.fn(),
    startConnect: vi.fn(),
    completeConnect: vi.fn(),
    redeemHandoff: vi.fn(),
    userAuthorization: vi.fn(),
    getAccount: vi.fn(),
    disconnect: vi.fn(),
    forgetSession: vi.fn(),
  };
});
vi.mock("../sources/hardcoverUser.js", () => ({
  findBookId: vi.fn(),
  myLists: vi.fn(),
  listBooks: vi.fn(),
  createList: vi.fn(),
  addListBook: vi.fn(),
  removeListBook: vi.fn(),
  readingProgress: vi.fn(),
}));
vi.mock("../services/workService.js", () => ({ getWorkDetail: vi.fn() }));
vi.mock("../sources/hardcover.js", () => {
  class HardcoverRateLimitError extends Error {
    constructor(readonly retryAfterSeconds: number) {
      super("rl");
    }
  }
  class HardcoverUnauthorizedError extends Error {}
  return { HardcoverRateLimitError, HardcoverUnauthorizedError };
});
import { getWorkDetail } from "../services/workService.js";
import { HardcoverRateLimitError, HardcoverUnauthorizedError } from "../sources/hardcover.js";
import * as user from "../sources/hardcoverUser.js";
import * as svc from "../services/hardcoverAccount.js";
import { hardcoverRoutes } from "./hardcover.js";

const m = vi.mocked(svc);

async function call(opts: InjectOptions) {
  const app = Fastify();
  await app.register(hardcoverRoutes);
  const res = await app.inject(opts);
  await app.close();
  return res;
}

beforeEach(() => {
  vi.resetAllMocks();
  m.accountEnabled.mockReturnValue(true);
});

describe("hardcover routes", () => {
  it("503 on every route when the feature is off", async () => {
    m.accountEnabled.mockReturnValue(false);
    for (const [method, url] of [
      ["POST", "/api/hardcover/connect"],
      ["GET", "/api/hardcover/callback"],
      ["POST", "/api/hardcover/session"],
      ["GET", "/api/hardcover/session"],
      ["DELETE", "/api/hardcover/session"],
    ] as const) {
      const res = await call({ method, url });
      expect(res.statusCode, url).toBe(503);
      expect(res.json()).toEqual({ error: "Hardcover sign-in isn't set up on this server." });
    }
  });

  it("connect returns the authorize URL", async () => {
    m.startConnect.mockReturnValue("https://hc/authorize");
    const res = await call({ method: "POST", url: "/api/hardcover/connect", payload: { returnTo: "bookexplorer://x" } });
    expect(res.json()).toEqual({ authorizeUrl: "https://hc/authorize" });
  });

  it("connect 400s on a disallowed returnTo", async () => {
    m.startConnect.mockImplementation(() => {
      throw new svc.InvalidReturnUrlError("nope");
    });
    const res = await call({ method: "POST", url: "/api/hardcover/connect", payload: { returnTo: "https://evil/" } });
    expect(res.statusCode).toBe(400);
  });

  it.each([{}, { returnTo: "" }, { returnTo: 5 }])("connect 400s on body %j", async (payload) => {
    const res = await call({ method: "POST", url: "/api/hardcover/connect", payload });
    expect(res.statusCode).toBe(400);
    expect(m.startConnect).not.toHaveBeenCalled();
  });

  it("callback 302s to the service's URL", async () => {
    m.completeConnect.mockResolvedValue("bookexplorer://done?handoff=abc");
    const res = await call({ method: "GET", url: "/api/hardcover/callback?code=c&state=s" });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("bookexplorer://done?handoff=abc");
  });

  it("callback 400s with the expiry text on ExpiredCallbackError", async () => {
    m.completeConnect.mockRejectedValue(new svc.ExpiredCallbackError());
    const res = await call({ method: "GET", url: "/api/hardcover/callback?code=c&state=s" });
    expect(res.statusCode).toBe(400);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.body).toBe("This sign-in link has expired. Go back to ShelfThread and try connecting again.");
  });

  it("POST session redeems a handoff", async () => {
    m.redeemHandoff.mockReturnValue({ token: "t", username: "u" });
    const res = await call({ method: "POST", url: "/api/hardcover/session", payload: { handoff: "h" } });
    expect(res.json()).toEqual({ token: "t", username: "u" });
  });

  it.each([[{ handoff: "h" }, true], [{}, false], [{ handoff: 1 }, false]])("POST session 400s on %j or unknown handoff", async (payload, wellFormed) => {
    m.redeemHandoff.mockReturnValue(null);
    const res = await call({ method: "POST", url: "/api/hardcover/session", payload });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "That sign-in has expired. Try connecting again." });
    if (!wellFormed) expect(m.redeemHandoff).not.toHaveBeenCalled();
  });

  it("GET session 401s without a valid header", async () => {
    m.getAccount.mockReturnValue(null);
    const res = await call({ method: "GET", url: "/api/hardcover/session" });
    expect(res.statusCode).toBe(401);
  });

  it("GET session returns the username", async () => {
    m.getAccount.mockReturnValue({ username: "u" });
    const res = await call({ method: "GET", url: "/api/hardcover/session", headers: { "x-hardcover-session": "t" } });
    expect(res.json()).toEqual({ username: "u" });
    expect(m.getAccount).toHaveBeenCalledWith("t");
  });

  it("DELETE session is 204 even with a missing header", async () => {
    const res = await call({ method: "DELETE", url: "/api/hardcover/session" });
    expect(res.statusCode).toBe(204);
  });

  it("DELETE session disconnects the given token", async () => {
    const res = await call({ method: "DELETE", url: "/api/hardcover/session", headers: { "x-hardcover-session": "t" } });
    expect(res.statusCode).toBe(204);
    expect(m.disconnect).toHaveBeenCalledWith("t");
  });

  describe("lists and progress", () => {
    const u = vi.mocked(user);
    const headers = { "x-hardcover-session": "S" };
    beforeEach(() => m.userAuthorization.mockResolvedValue("Bearer T"));

    it("401 without a session", async () => {
      m.userAuthorization.mockResolvedValue(null);
      expect((await call({ method: "GET", url: "/api/hardcover/lists" })).statusCode).toBe(401);
    });

    it("lists the user's lists", async () => {
      u.myLists.mockResolvedValue([{ id: 1, name: "n", description: "", booksCount: 0 }]);
      const res = await call({ method: "GET", url: "/api/hardcover/lists", headers });
      expect(res.json()).toEqual([{ id: 1, name: "n", description: "", booksCount: 0 }]);
    });

    it("list detail 404s when missing and 400s on a bad id", async () => {
      u.listBooks.mockResolvedValue(null);
      expect((await call({ method: "GET", url: "/api/hardcover/lists/5", headers })).statusCode).toBe(404);
      expect((await call({ method: "GET", url: "/api/hardcover/lists/abc", headers })).statusCode).toBe(400);
      expect((await call({ method: "GET", url: "/api/hardcover/lists/0", headers })).statusCode).toBe(400);
    });

    it("creates a list, trimming the name", async () => {
      u.createList.mockResolvedValue(9);
      const res = await call({ method: "POST", url: "/api/hardcover/lists", headers, payload: { name: "  Mine ", description: "d" } });
      expect(res.json()).toEqual({ id: 9 });
      expect(u.createList).toHaveBeenCalledWith({ name: "Mine", description: "d" }, "Bearer T");
    });

    it("rejects bad create bodies", async () => {
      for (const payload of [{ name: "  " }, { name: "x".repeat(101) }, { name: "a", description: "x".repeat(1001) }, { name: 3 }, { name: "a", description: 5 }]) {
        expect((await call({ method: "POST", url: "/api/hardcover/lists", headers, payload })).statusCode, JSON.stringify(payload)).toBe(400);
      }
      expect(u.createList).not.toHaveBeenCalled();
    });

    it("adds a book by ISBN", async () => {
      u.findBookId.mockResolvedValue(77);
      const res = await call({ method: "POST", url: "/api/hardcover/lists/3/books", headers, payload: { type: "book", id: "978-0-306-40615-7" } });
      expect(res.json()).toEqual({ hardcoverBookId: 77 });
      expect(u.findBookId).toHaveBeenCalledWith(["9780306406157"], "Bearer T");
      expect(u.addListBook).toHaveBeenCalledWith(3, 77, "Bearer T");
    });

    it("adding a work with no ISBNs on Hardcover → 404 with the copy", async () => {
      vi.mocked(getWorkDetail).mockResolvedValue({ isbn: "9780306406157", editions: [{ isbn: null }, { isbn: "9780306406157" }] } as never);
      u.findBookId.mockResolvedValue(null);
      const res = await call({ method: "POST", url: "/api/hardcover/lists/3/books", headers, payload: { type: "work", id: "OL1W" } });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "Hardcover doesn't have this book yet." });
      expect(u.findBookId).toHaveBeenCalledWith(["9780306406157"], "Bearer T");
      expect(u.addListBook).not.toHaveBeenCalled();
    });

    it("an unknown work is 404", async () => {
      vi.mocked(getWorkDetail).mockResolvedValue(null);
      u.findBookId.mockResolvedValue(null);
      const res = await call({ method: "POST", url: "/api/hardcover/lists/3/books", headers, payload: { type: "work", id: "OL1W" } });
      expect(res.statusCode).toBe(404);
      expect(u.findBookId).toHaveBeenCalledWith([], "Bearer T");
    });

    it("rejects a malformed work id with 400", async () => {
      const res = await call({ method: "POST", url: "/api/hardcover/lists/3/books", headers, payload: { type: "work", id: "nope" } });
      expect(res.statusCode).toBe(400);
    });

    it("rejects bad add bodies", async () => {
      for (const payload of [{ type: "x", id: "a" }, { type: "book", id: "" }, { type: "book", id: 5 }, {}]) {
        expect((await call({ method: "POST", url: "/api/hardcover/lists/3/books", headers, payload })).statusCode, JSON.stringify(payload)).toBe(400);
      }
    });

    it("removes a book with 204 and validates ids", async () => {
      expect((await call({ method: "DELETE", url: "/api/hardcover/lists/3/books/4", headers })).statusCode).toBe(204);
      expect(u.removeListBook).toHaveBeenCalledWith(3, 4, "Bearer T");
      expect((await call({ method: "DELETE", url: "/api/hardcover/lists/3/books/x", headers })).statusCode).toBe(400);
    });

    it("progress: nulls when Hardcover lacks the book, 400 on bad type", async () => {
      u.findBookId.mockResolvedValue(null);
      const res = await call({ method: "GET", url: "/api/hardcover/progress/book/9780306406157", headers });
      expect(res.json()).toEqual({ status: null, percent: null });
      expect((await call({ method: "GET", url: "/api/hardcover/progress/edition/x", headers })).statusCode).toBe(400);
    });

    it("progress returns reading state", async () => {
      u.findBookId.mockResolvedValue(5);
      u.readingProgress.mockResolvedValue({ status: "reading", percent: 40 });
      const res = await call({ method: "GET", url: "/api/hardcover/progress/book/9780306406157", headers });
      expect(res.json()).toEqual({ status: "reading", percent: 40 });
    });

    it("Hardcover 401 forgets the session and returns 401", async () => {
      u.myLists.mockRejectedValue(new HardcoverUnauthorizedError());
      const res = await call({ method: "GET", url: "/api/hardcover/lists", headers });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: "Connect your Hardcover account again." });
      expect(m.forgetSession).toHaveBeenCalledWith("S");
    });

    it("Hardcover 429 → 429 with Retry-After", async () => {
      u.myLists.mockRejectedValue(new HardcoverRateLimitError(30));
      const res = await call({ method: "GET", url: "/api/hardcover/lists", headers });
      expect(res.statusCode).toBe(429);
      expect(res.headers["retry-after"]).toBe("30");
      expect(res.json()).toEqual({ error: "Hardcover is busy. Try again in a minute.", retryAfterSeconds: 30 });
    });
  });
});
