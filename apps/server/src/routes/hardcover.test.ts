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
  };
});
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
});
