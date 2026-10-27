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
    const meta = await pageMeta(path).catch(() => null);
    return reply
      .header("Cache-Control", "public, max-age=3600")
      .type("text/html; charset=utf-8")
      .send(injectSocialTags(html, renderSocialTags(meta, origin + path, origin)));
  });
}
