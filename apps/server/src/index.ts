import Fastify from "fastify";
import cors from "@fastify/cors";
import { booksRoutes } from "./routes/books.js";
import { authorsRoutes } from "./routes/authors.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.get("/health", async () => ({ status: "ok" }));

await app.register(booksRoutes);
await app.register(authorsRoutes);

const port = Number(process.env.PORT ?? 3001);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
