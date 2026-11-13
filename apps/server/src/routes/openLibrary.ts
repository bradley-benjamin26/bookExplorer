import type { OpenLibraryMember } from "@book-explorer/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  OpenLibrarySignedOutError, asUser, connect, disconnectOpenLibrary, getOpenLibraryAccount, openLibraryEnabled, resolveMembers,
} from "../services/openLibraryAccount.js";
import { OpenLibraryAuthError, OpenLibraryRateLimitError, createList, getList, myLists, updateSeeds } from "../sources/openLibraryUser.js";
import { clearSessionCookie, sessionFrom, setSessionCookie } from "../sessionCookie.js";
import { upstreamErrorHandler } from "../upstreamErrorHandler.js";

const SESSION_HEADER = "x-openlibrary-session";
const SESSION_COOKIE = "ol_session";
const COOKIE_PATH = "/api/openlibrary/";
const session = (req: FastifyRequest) => sessionFrom(req, SESSION_HEADER, SESSION_COOKIE);
const SIGNED_OUT = "Connect your Open Library account again.";
const KEY = /^[A-Za-z0-9]{8,64}$/;
const LIST_ID = /^OL\d+L$/;
const SEED = /^\/(works\/OL\d+W|books\/OL\d+M|authors\/OL\d+A)$/;
const MEMBER_ID = { book: /^(\d{13}|\d{9}[\dXx])$/, work: /^OL\d+W$/, author: /^OL\d+A$/ };

export async function openLibraryRoutes(app: FastifyInstance) {
  app.setErrorHandler((err: Error, req, reply) => {
    if (err instanceof OpenLibraryRateLimitError) {
      return reply.code(429).header("Retry-After", String(err.retryAfterSeconds)).send({ error: "Open Library is busy. Try again in a minute.", retryAfterSeconds: err.retryAfterSeconds });
    }
    if (err instanceof OpenLibrarySignedOutError) return reply.code(401).send({ error: SIGNED_OUT });
    return upstreamErrorHandler(err, req, reply);
  });

  app.addHook("onRequest", async (_req, reply) => {
    if (!openLibraryEnabled()) return reply.code(503).send({ error: "Open Library sign-in isn't set up on this server." });
  });

  app.post<{ Body: { access?: unknown; secret?: unknown; cookie?: unknown } | null }>("/api/openlibrary/session", async (req, reply) => {
    const { access, secret, cookie } = req.body ?? {};
    if (typeof access !== "string" || typeof secret !== "string" || !KEY.test(access) || !KEY.test(secret)) {
      return reply.code(400).send({ error: "Enter both keys." });
    }
    try {
      const connected = await connect(access, secret);
      if (cookie === true) setSessionCookie(req, reply, SESSION_COOKIE, COOKIE_PATH, connected.token);
      return connected;
    } catch (err) {
      if (err instanceof OpenLibraryAuthError) return reply.code(401).send({ error: "Open Library didn't accept those keys. Check both and try again." });
      throw err;
    }
  });

  app.get("/api/openlibrary/session", async (req, reply) => getOpenLibraryAccount(session(req)) ?? reply.code(401).send({ error: SIGNED_OUT }));

  app.delete("/api/openlibrary/session", async (req, reply) => {
    disconnectOpenLibrary(session(req));
    clearSessionCookie(reply, SESSION_COOKIE, COOKIE_PATH);
    return reply.code(204).send();
  });

  app.get("/api/openlibrary/lists", async (req) => asUser(session(req), (s) => myLists(s.username)));

  app.get<{ Params: { listId: string } }>("/api/openlibrary/lists/:listId", async (req, reply) => {
    if (!LIST_ID.test(req.params.listId)) return reply.code(400).send({ error: "Invalid list id" });
    const list = await asUser(session(req), (s) => getList(s.username, req.params.listId));
    return list ?? reply.code(404).send({ error: "List not found" });
  });

  app.post<{ Body: { name?: unknown; description?: unknown } | null }>("/api/openlibrary/lists", async (req, reply) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const description = req.body?.description ?? "";
    if (!name || name.length > 100 || typeof description !== "string" || description.length > 1000) {
      return reply.code(400).send({ error: "A list needs a name up to 100 characters and a description up to 1000." });
    }
    return { id: await asUser(session(req), (s) => createList(s.username, { name, description }, s.cookie)) };
  });

  app.post<{ Params: { listId: string }; Body: { members?: unknown } | null }>("/api/openlibrary/lists/:listId/seeds", async (req, reply) => {
    const members = req.body?.members;
    const valid =
      Array.isArray(members) && members.length >= 1 && members.length <= 100 &&
      members.every((m) => m && typeof m.id === "string" && Object.hasOwn(MEMBER_ID, m.type) && MEMBER_ID[m.type as keyof typeof MEMBER_ID].test(m.id));
    if (!LIST_ID.test(req.params.listId) || !valid) return reply.code(400).send({ error: "Invalid list or members" });
    // Signed-in callers only, so the app key alone can't drive up to 100 lookups; lookups stay outside asUser so an expired-cookie retry only repeats the write.
    if (!getOpenLibraryAccount(session(req))) throw new OpenLibrarySignedOutError("Not signed in");
    const result = await resolveMembers((members as OpenLibraryMember[]).map((m) => ({ ...m, id: m.id.toUpperCase() })));
    if (result.added.length) await asUser(session(req), (s) => updateSeeds(s.username, req.params.listId, { add: result.added.map((a) => a.seed), remove: [] }, s.cookie));
    return result;
  });

  app.delete<{ Params: { listId: string }; Querystring: { seed?: string } }>("/api/openlibrary/lists/:listId/seeds", async (req, reply) => {
    const { seed } = req.query;
    if (!LIST_ID.test(req.params.listId) || typeof seed !== "string" || !SEED.test(seed)) return reply.code(400).send({ error: "Invalid list or seed" });
    await asUser(session(req), (s) => updateSeeds(s.username, req.params.listId, { add: [], remove: [seed] }, s.cookie));
    return reply.code(204).send();
  });
}
