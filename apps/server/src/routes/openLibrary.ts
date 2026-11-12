import type { OpenLibraryAddResult, OpenLibraryMember } from "@book-explorer/shared";
import type { FastifyInstance } from "fastify";
import {
  OpenLibrarySignedOutError, asUser, connect, disconnectOpenLibrary, getOpenLibraryAccount, openLibraryEnabled,
} from "../services/openLibraryAccount.js";
import { OpenLibraryAuthError, OpenLibraryRateLimitError, createList, getList, myLists, seedFor, updateSeeds } from "../sources/openLibraryUser.js";
import { upstreamErrorHandler } from "../upstreamErrorHandler.js";

const SESSION_HEADER = "x-openlibrary-session";
const SIGNED_OUT = "Connect your Open Library account again.";
const KEY = /^[A-Za-z0-9]{8,64}$/;
const LIST_ID = /^OL\d+L$/;
const SEED = /^\/(works\/OL\d+W|books\/OL\d+M|authors\/OL\d+A)$/;
const MEMBER_ID = { book: /^(\d{13}|\d{9}[\dX])$/, work: /^OL\d+W$/, author: /^OL\d+A$/ };

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

  app.post<{ Body: { access?: unknown; secret?: unknown } | null }>("/api/openlibrary/session", async (req, reply) => {
    const { access, secret } = req.body ?? {};
    if (typeof access !== "string" || typeof secret !== "string" || !KEY.test(access) || !KEY.test(secret)) {
      return reply.code(400).send({ error: "Enter both keys." });
    }
    try {
      return await connect(access, secret);
    } catch (err) {
      if (err instanceof OpenLibraryAuthError) return reply.code(401).send({ error: "Open Library didn't accept those keys. Check both and try again." });
      throw err;
    }
  });

  app.get("/api/openlibrary/session", async (req, reply) => getOpenLibraryAccount(req.headers[SESSION_HEADER]) ?? reply.code(401).send({ error: SIGNED_OUT }));

  app.delete("/api/openlibrary/session", async (req, reply) => {
    disconnectOpenLibrary(req.headers[SESSION_HEADER]);
    return reply.code(204).send();
  });

  app.get("/api/openlibrary/lists", async (req) => asUser(req.headers[SESSION_HEADER], (s) => myLists(s.username)));

  app.get<{ Params: { listId: string } }>("/api/openlibrary/lists/:listId", async (req, reply) => {
    if (!LIST_ID.test(req.params.listId)) return reply.code(400).send({ error: "Invalid list id" });
    const list = await asUser(req.headers[SESSION_HEADER], (s) => getList(s.username, req.params.listId));
    return list ?? reply.code(404).send({ error: "List not found" });
  });

  app.post<{ Body: { name?: unknown; description?: unknown } | null }>("/api/openlibrary/lists", async (req, reply) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const description = req.body?.description ?? "";
    if (!name || name.length > 100 || typeof description !== "string" || description.length > 1000) {
      return reply.code(400).send({ error: "A list needs a name up to 100 characters and a description up to 1000." });
    }
    return { id: await asUser(req.headers[SESSION_HEADER], (s) => createList(s.username, { name, description }, s.cookie)) };
  });

  app.post<{ Params: { listId: string }; Body: { members?: unknown } | null }>("/api/openlibrary/lists/:listId/seeds", async (req, reply) => {
    const members = req.body?.members;
    const valid =
      Array.isArray(members) && members.length >= 1 && members.length <= 100 &&
      members.every((m) => m && typeof m.id === "string" && Object.hasOwn(MEMBER_ID, m.type) && MEMBER_ID[m.type as keyof typeof MEMBER_ID].test(m.id));
    if (!LIST_ID.test(req.params.listId) || !valid) return reply.code(400).send({ error: "Invalid list or members" });
    const list = members as OpenLibraryMember[];
    return asUser(req.headers[SESSION_HEADER], async (s): Promise<OpenLibraryAddResult> => {
      const seeds = await Promise.all(list.map(({ type, id }) => seedFor({ type, id })));
      const result: OpenLibraryAddResult = { added: [], missing: [] };
      list.forEach(({ type, id }, i) => {
        const seed = seeds[i];
        if (seed) result.added.push({ type, id, seed });
        else result.missing.push({ type, id });
      });
      if (result.added.length) await updateSeeds(s.username, req.params.listId, { add: result.added.map((a) => a.seed), remove: [] }, s.cookie);
      return result;
    });
  });

  app.delete<{ Params: { listId: string }; Querystring: { seed?: string } }>("/api/openlibrary/lists/:listId/seeds", async (req, reply) => {
    const { seed } = req.query;
    if (!LIST_ID.test(req.params.listId) || typeof seed !== "string" || !SEED.test(seed)) return reply.code(400).send({ error: "Invalid list or seed" });
    await asUser(req.headers[SESSION_HEADER], (s) => updateSeeds(s.username, req.params.listId, { add: [], remove: [seed] }, s.cookie));
    return reply.code(204).send();
  });
}
