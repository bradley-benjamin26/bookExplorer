import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { isValidAppKey } from "./appAuth.js";
import { parseTrustProxy } from "./trustProxy.js";
import { booksRoutes } from "./routes/books.js";
import { authorsRoutes } from "./routes/authors.js";
import { subjectsRoutes } from "./routes/subjects.js";
import { worksRoutes } from "./routes/works.js";
import { graphRoutes } from "./routes/graph.js";
import { searchRoutes } from "./routes/search.js";
import { seriesRoutes } from "./routes/series.js";
import { pathRoutes } from "./routes/path.js";
import { upstreamErrorHandler } from "./upstreamErrorHandler.js";
import { initPersistentCache } from "./cache.js";

// Behind a load balancer or reverse proxy (most hosting platforms), every
// request arrives from the proxy's own IP — without trusting its
// X-Forwarded-For header, the per-IP rate limit below would treat all users
// as one client and throttle them together. Only the proxy's own hop is
// trusted, never the whole header: a client can send its own
// X-Forwarded-For, which the proxy appends to rather than replaces, so
// trusting every address in it would let any caller pick their own IP and
// dodge the limit. Off unless TRUST_PROXY is set (see trustProxy.ts).
const app = Fastify({ logger: true, trustProxy: parseTrustProxy(process.env.TRUST_PROXY) });

await app.register(cors, { origin: true });

// A required source in a cooldown (see httpClient.ts) is a temporary 503 the
// app can explain, not a generic 500.
app.setErrorHandler(upstreamErrorHandler);

// A shared secret the app itself sends on every request (see .env.example),
// checked in constant time so a timing side-channel can't leak it a byte at
// a time. This is not real per-user authentication — it's baked into every
// copy of the app, so anyone who decompiles it or sniffs its traffic can
// recover it — it exists only to filter out the bulk of unintended traffic
// (scanners, crawlers, anyone probing the URL directly) rather than to stop
// a determined, targeted attacker. Left unset, the check is skipped
// entirely, so local development against a LAN server needs no changes.
const appSharedSecret = process.env.APP_SHARED_SECRET;

if (appSharedSecret) {
  app.addHook("onRequest", async (request, reply) => {
    if (request.url.split("?")[0] === "/health") return;
    if (!isValidAppKey(request.headers["x-app-key"], appSharedSecret)) {
      return reply.code(401).send({ error: "Missing or invalid X-App-Key header" });
    }
  });
}

// Caps how many requests one IP can make per minute — the main defense
// against this server's own quota-limited upstream keys (Hardcover, Google
// Books) getting burned through by a scraper or bot hitting the API
// directly, now that it's reachable from the public internet rather than
// just a LAN. Generous enough that normal use of the app (browsing a few
// books, a graph, an author) never comes close to it. Registered after the
// app-key check above so requests rejected there (hooks run in the order
// they're added) don't count against a real client's allowance.
await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

app.get("/health", { config: { rateLimit: false } }, async () => ({ status: "ok" }));

await app.register(booksRoutes);
await app.register(authorsRoutes);
await app.register(subjectsRoutes);
await app.register(worksRoutes);
await app.register(graphRoutes);
await app.register(searchRoutes);
await app.register(seriesRoutes);
await app.register(pathRoutes);

if (process.env.CACHE_DB_PATH) initPersistentCache(process.env.CACHE_DB_PATH);

const port = Number(process.env.PORT ?? 3001);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
