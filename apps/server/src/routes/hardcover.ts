import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  ExpiredCallbackError,
  InvalidReturnUrlError,
  accountEnabled,
  completeConnect,
  disconnect,
  getAccount,
  redeemHandoff,
  startConnect,
  userAuthorization,
} from "../services/hardcoverAccount.js";

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

export async function hardcoverRoutes(app: FastifyInstance) {
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
}
