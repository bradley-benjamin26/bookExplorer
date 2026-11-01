import { isValidIsbn, normalizeIsbn } from "@book-explorer/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  ExpiredCallbackError,
  InvalidReturnUrlError,
  accountEnabled,
  completeConnect,
  disconnect,
  forgetSession,
  getAccount,
  redeemHandoff,
  startConnect,
  userAuthorization,
} from "../services/hardcoverAccount.js";
import { getWorkDetail } from "../services/workService.js";
import { HardcoverRateLimitError, HardcoverUnauthorizedError } from "../sources/hardcover.js";
import { addListBook, createList, findBookId, listBooks, myLists, readingProgress, removeListBook } from "../sources/hardcoverUser.js";
import { upstreamErrorHandler } from "../upstreamErrorHandler.js";
import { isOpenLibraryWorkId } from "../validation.js";

const SESSION_HEADER = "x-hardcover-session";
const HANDOFF_EXPIRED = "That sign-in has expired. Try connecting again.";
const CALLBACK_EXPIRED = "This sign-in link has expired. Go back to ShelfThread and try connecting again.";

/** Returns the Bearer header for the signed-in user, or sends 401 and returns null. Refresh failures other than revocation propagate. */
export async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  const auth = await userAuthorization(request.headers[SESSION_HEADER]);
  if (!auth) {
    reply.code(401).send({ error: "Connect your Hardcover account again." });
    return null;
  }
  return auth;
}

const NOT_ON_HARDCOVER = "Hardcover doesn't have this book yet.";
const isPositiveInt = (v: string) => /^[1-9]\d{0,9}$/.test(v);

/** ISBNs to look a member up by, or null when the id is malformed. A work Open Library doesn't know gives []. */
async function memberIsbns(type: string, id: string, auth: string): Promise<string[] | null> {
  if (type === "book") return isValidIsbn(id) ? [normalizeIsbn(id)] : null;
  if (!isOpenLibraryWorkId(id)) return null;
  const work = await getWorkDetail(id, auth);
  if (!work) return [];
  return [...new Set([work.isbn, ...work.editions.map((e) => e.isbn)].filter((i): i is string => !!i))];
}

export async function hardcoverRoutes(app: FastifyInstance) {
  app.setErrorHandler((err: Error, req, reply) => {
    if (err instanceof HardcoverRateLimitError) {
      return reply.code(429).header("Retry-After", String(err.retryAfterSeconds)).send({ error: "Hardcover is busy. Try again in a minute.", retryAfterSeconds: err.retryAfterSeconds });
    }
    if (err instanceof HardcoverUnauthorizedError) {
      const session = req.headers[SESSION_HEADER];
      if (typeof session === "string") forgetSession(session);
      return reply.code(401).send({ error: "Connect your Hardcover account again." });
    }
    return upstreamErrorHandler(err, req, reply);
  });

  app.addHook("onRequest", async (_req, reply) => {
    if (!accountEnabled()) return reply.code(503).send({ error: "Hardcover sign-in isn't set up on this server." });
  });

  app.post<{ Body: { returnTo?: unknown } | null }>("/api/hardcover/connect", async (req, reply) => {
    const returnTo = req.body?.returnTo;
    if (typeof returnTo !== "string" || !returnTo) return reply.code(400).send({ error: "returnTo is required" });
    try {
      return { authorizeUrl: startConnect(returnTo) };
    } catch (err) {
      if (err instanceof InvalidReturnUrlError) return reply.code(400).send({ error: "That return address isn't allowed." });
      throw err;
    }
  });

  app.get<{ Querystring: { code?: string; state?: string; iss?: string; error?: string } }>("/api/hardcover/callback", async (req, reply) => {
    try {
      return reply.redirect(await completeConnect(req.query), 302);
    } catch (err) {
      if (err instanceof ExpiredCallbackError) return reply.code(400).type("text/plain").send(CALLBACK_EXPIRED);
      throw err;
    }
  });

  app.post<{ Body: { handoff?: unknown } | null }>("/api/hardcover/session", async (req, reply) => {
    const handoff = req.body?.handoff;
    const session = typeof handoff === "string" ? redeemHandoff(handoff) : null;
    if (!session) return reply.code(400).send({ error: HANDOFF_EXPIRED });
    return session;
  });

  app.get("/api/hardcover/session", async (req, reply) => {
    const account = getAccount(req.headers[SESSION_HEADER]);
    if (!account) return reply.code(401).send({ error: "Connect your Hardcover account again." });
    return account;
  });

  app.delete("/api/hardcover/session", async (req, reply) => {
    await disconnect(req.headers[SESSION_HEADER]);
    return reply.code(204).send();
  });

  app.get("/api/hardcover/lists", async (req, reply) => {
    const auth = await requireUser(req, reply);
    if (auth) return myLists(auth);
  });

  app.get<{ Params: { listId: string } }>("/api/hardcover/lists/:listId", async (req, reply) => {
    if (!isPositiveInt(req.params.listId)) return reply.code(400).send({ error: "Invalid list id" });
    const auth = await requireUser(req, reply);
    if (!auth) return;
    const list = await listBooks(Number(req.params.listId), auth);
    return list ?? reply.code(404).send({ error: "List not found" });
  });

  app.post<{ Body: { name?: unknown; description?: unknown } | null }>("/api/hardcover/lists", async (req, reply) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const description = req.body?.description ?? "";
    if (!name || name.length > 100 || typeof description !== "string" || description.length > 1000) {
      return reply.code(400).send({ error: "A list needs a name up to 100 characters and a description up to 1000." });
    }
    const auth = await requireUser(req, reply);
    if (auth) return { id: await createList({ name, description }, auth) };
  });

  app.post<{ Params: { listId: string }; Body: { type?: unknown; id?: unknown } | null }>("/api/hardcover/lists/:listId/books", async (req, reply) => {
    const { type, id } = req.body ?? {};
    if (!isPositiveInt(req.params.listId) || (type !== "book" && type !== "work") || typeof id !== "string" || !id) {
      return reply.code(400).send({ error: "Invalid list or book" });
    }
    const auth = await requireUser(req, reply);
    if (!auth) return;
    const isbns = await memberIsbns(type, id, auth);
    if (!isbns) return reply.code(400).send({ error: "Invalid book id" });
    const hardcoverBookId = await findBookId(isbns, auth);
    if (hardcoverBookId === null) return reply.code(404).send({ error: NOT_ON_HARDCOVER });
    await addListBook(Number(req.params.listId), hardcoverBookId, auth);
    return { hardcoverBookId };
  });

  app.delete<{ Params: { listId: string; bookId: string } }>("/api/hardcover/lists/:listId/books/:bookId", async (req, reply) => {
    if (!isPositiveInt(req.params.listId) || !isPositiveInt(req.params.bookId)) return reply.code(400).send({ error: "Invalid list or book id" });
    const auth = await requireUser(req, reply);
    if (!auth) return;
    await removeListBook(Number(req.params.listId), Number(req.params.bookId), auth);
    return reply.code(204).send();
  });

  app.get<{ Params: { type: string; id: string } }>("/api/hardcover/progress/:type/:id", async (req, reply) => {
    const { type, id } = req.params;
    if (type !== "book" && type !== "work") return reply.code(400).send({ error: "Invalid type" });
    const auth = await requireUser(req, reply);
    if (!auth) return;
    const isbns = await memberIsbns(type, id, auth);
    if (!isbns) return reply.code(400).send({ error: "Invalid book id" });
    const bookId = await findBookId(isbns, auth);
    return bookId === null ? { status: null, percent: null } : readingProgress(bookId, auth);
  });
}
