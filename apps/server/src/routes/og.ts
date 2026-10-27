import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { DEFAULT_WEB_ORIGIN, injectSocialTags, pageMeta, renderSocialTags } from "../socialMeta.js";

/**
 * Serves the web app's index.html with link-preview tags for the page at
 * /og/<web path>. A reverse proxy sends only crawlers here (see
 * docs/deploy-social-cards.md); people get the static site.
 */
export async function ogRoutes(app: FastifyInstance, opts: { indexHtml: string; origin?: string }) {
  const origin = (opts.origin || DEFAULT_WEB_ORIGIN).replace(/\/+$/, "");
  app.get("/og/*", async (req, reply) => {
    const path = req.url.split("?")[0].slice("/og".length);
    let html: string;
    try {
      html = await readFile(opts.indexHtml, "utf8");
    } catch (err) {
      req.log.error(err, "WEB_INDEX_HTML unreadable");
      return reply.code(500).send({ error: "Web index unavailable" });
    }
    let meta = null;
    try {
      meta = await pageMeta(path);
    } catch (err) {
      req.log.warn(err, "page lookup failed; serving default tags");
    }
    // A generic card (unknown path or failed lookup) must not be pinned in caches.
    return reply
      .header("Cache-Control", meta ? "public, max-age=3600" : "no-store")
      .type("text/html; charset=utf-8")
      .send(injectSocialTags(html, renderSocialTags(meta, meta ? origin + path : `${origin}/`, origin)));
  });
}
