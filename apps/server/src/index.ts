import Fastify from "fastify";
import cors from "@fastify/cors";
import { booksRoutes } from "./routes/books.js";
import { authorsRoutes } from "./routes/authors.js";
import { subjectsRoutes } from "./routes/subjects.js";
import { worksRoutes } from "./routes/works.js";
import { graphRoutes } from "./routes/graph.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.get("/health", async () => ({ status: "ok" }));

await app.register(booksRoutes);
await app.register(authorsRoutes);
await app.register(subjectsRoutes);
await app.register(worksRoutes);
await app.register(graphRoutes);

const port = Number(process.env.PORT ?? 3001);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
