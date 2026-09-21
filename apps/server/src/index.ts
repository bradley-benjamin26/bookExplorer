import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { isValidAppKey } from "./appAuth.js";
import { booksRoutes } from "./routes/books.js";
import { authorsRoutes } from "./routes/authors.js";
import { subjectsRoutes } from "./routes/subjects.js";
import { worksRoutes } from "./routes/works.js";
import { graphRoutes } from "./routes/graph.js";
import { searchRoutes } from "./routes/search.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

// Caps how many requests one IP can make per minute — the main defense
// against this server's own quota-limited upstream keys (Hardcover, Google
// Books) getting burned through by a scraper or bot hitting the API
// directly, now that it's reachable from the public internet rather than
// just a LAN. Generous enough that normal use of the app (browsing a few
// books, a graph, an author) never comes close to it.
await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

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
    if (request.url === "/health") return;
    if (!isValidAppKey(request.headers["x-app-key"], appSharedSecret)) {
      return reply.code(401).send({ error: "Missing or invalid X-App-Key header" });
    }
  });
}

app.get("/health", { config: { rateLimit: false } }, async () => ({ status: "ok" }));

await app.register(booksRoutes);
await app.register(authorsRoutes);
await app.register(subjectsRoutes);
await app.register(worksRoutes);
await app.register(graphRoutes);
await app.register(searchRoutes);

const port = Number(process.env.PORT ?? 3001);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
