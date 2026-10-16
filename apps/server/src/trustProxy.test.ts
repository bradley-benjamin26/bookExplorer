import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { parseTrustProxy } from "./trustProxy.js";

async function clientIp(trustProxy: ReturnType<typeof parseTrustProxy>, forwardedFor: string) {
  const app = Fastify({ trustProxy });
  app.get("/", async (req) => ({ ip: req.ip }));
  const res = await app.inject({
    method: "GET",
    url: "/",
    remoteAddress: "10.0.0.1",
    headers: { "x-forwarded-for": forwardedFor },
  });
  await app.close();
  return res.json().ip as string;
}

describe("parseTrustProxy", () => {
  it("parses each supported form", () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy("")).toBe(false);
    expect(parseTrustProxy("false")).toBe(false);
    expect(typeof parseTrustProxy("true")).toBe("function");
    expect(typeof parseTrustProxy(" 2 ")).toBe("function");
    expect(parseTrustProxy("10.0.0.0/8,127.0.0.1")).toBe("10.0.0.0/8,127.0.0.1");
  });

  it("ignores a client-forged X-Forwarded-For entry behind one proxy", async () => {
    // The client sent "6.6.6.6"; the proxy (10.0.0.1) appended the real client address.
    expect(await clientIp(parseTrustProxy("true"), "6.6.6.6, 203.0.113.9")).toBe("203.0.113.9");
    expect(await clientIp(parseTrustProxy("10.0.0.0/8"), "6.6.6.6, 203.0.113.9")).toBe("203.0.113.9");
  });

  it("trusts exactly the configured number of hops", async () => {
    // CDN appended 198.51.100.7 (the real client), then the load balancer (socket peer) forwarded it.
    expect(await clientIp(parseTrustProxy("2"), "6.6.6.6, 198.51.100.7, 192.0.2.1")).toBe("198.51.100.7");
  });

  it("uses the socket address when no proxy is trusted", async () => {
    expect(await clientIp(parseTrustProxy(undefined), "6.6.6.6")).toBe("10.0.0.1");
  });
});
