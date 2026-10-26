import type { FastifyReply, FastifyRequest } from "fastify";
import { UpstreamUnavailableError } from "./httpClient.js";

/** Fastify error handler: a required source in a cooldown is a temporary 503 the app can explain, not a generic 500. */
export function upstreamErrorHandler(err: Error, _req: FastifyRequest, reply: FastifyReply) {
  if (!(err instanceof UpstreamUnavailableError)) return reply.send(err);
  const seconds = Math.ceil(err.retryAfterMs / 1000);
  const minutes = Math.ceil(seconds / 60);
  return reply
    .code(503)
    .header("Retry-After", String(seconds))
    .send({ error: `Book data is temporarily unavailable, try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` });
}
