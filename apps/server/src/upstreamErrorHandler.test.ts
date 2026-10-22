import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { UpstreamUnavailableError } from "./httpClient.js";
import { upstreamErrorHandler } from "./upstreamErrorHandler.js";

describe("upstreamErrorHandler", () => {
  const app = Fastify();
  app.setErrorHandler(upstreamErrorHandler);
  app.get("/cool", async () => {
    throw new UpstreamUnavailableError("openlibrary.org", 120_000);
  });
  app.get("/boom", async () => {
    throw new Error("boom");
  });

  it("maps a cooldown to 503 with Retry-After and a minutes message", async () => {
    const res = await app.inject({ url: "/cool" });
    expect(res.statusCode).toBe(503);
    expect(res.headers["retry-after"]).toBe("120");
    expect(res.json().error).toBe("Book data is temporarily unavailable, try again in 2 minutes.");
  });

  it("leaves other errors as 500", async () => {
    expect((await app.inject({ url: "/boom" })).statusCode).toBe(500);
  });
});
