import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type PageMeta, pageMeta } from "../socialMeta.js";
import { ogRoutes } from "./og.js";

vi.mock("../socialMeta.js", async (orig) => ({ ...(await orig<typeof import("../socialMeta.js")>()), pageMeta: vi.fn((p: string) => lookup(p)) }));

let lookup: (p: string) => Promise<PageMeta | null> = async () => null;

const dir = mkdtempSync(join(tmpdir(), "og-"));
const indexHtml = join(dir, "index.html");
writeFileSync(indexHtml, "<html><head><!-- social:start -->OLD<!-- social:end --></head></html>");

async function get(url: string, file = indexHtml) {
  const app = Fastify();
  await app.register(ogRoutes, { indexHtml: file, origin: "https://site.test" });
  const res = await app.inject({ method: "GET", url });
  await app.close();
  return res;
}

beforeEach(() => {
  vi.mocked(pageMeta).mockClear();
});

describe("GET /og/*", () => {
  it("serves the page's tags with the /og prefix stripped from og:url", async () => {
    lookup = async () => ({ title: "Dune", description: "Sand.", image: null });
    const res = await get("/og/work/OL1W?x=1");
    expect(pageMeta).toHaveBeenCalledWith("/work/OL1W");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");
    expect(res.body).toContain("<title>Dune · Shelf Thread</title>");
    expect(res.body).toContain('og:url" content="https://site.test/work/OL1W"');
    expect(res.body).not.toContain("OLD");
  });

  async function expectDefaultCard() {
    const res = await get("/og/work/OL1W");
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toContain("<title>Shelf Thread</title>");
    expect(res.body).toContain('og:url" content="https://site.test/"');
  }

  it("no meta → 200 default tags, uncached, og:url is the site root", async () => {
    lookup = async () => null;
    await expectDefaultCard();
  });

  it("a throwing lookup → the same default card", async () => {
    lookup = async () => {
      throw new Error("boom");
    };
    await expectDefaultCard();
  });

  it("returns 500 when the index file is missing", async () => {
    expect((await get("/og/work/OL1W", join(dir, "missing.html"))).statusCode).toBe(500);
  });
});
