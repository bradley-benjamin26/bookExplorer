import type { FastifyReply, FastifyRequest } from "fastify";

const MAX_AGE_S = 90 * 24 * 60 * 60; // accountStore's SESSION_TTL_MS; the server refuses an older session anyway

export function readCookie(req: FastifyRequest, name: string): string | undefined {
  return req.headers.cookie?.split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1) || undefined;
}

/** Native apps send the session in a header; the web app's is an httpOnly cookie script can't read. */
export function sessionFrom(req: FastifyRequest, header: string, cookie: string): string | undefined {
  const value = req.headers[header];
  return typeof value === "string" ? value : readCookie(req, cookie);
}

// Strict: api.shelfthread.com and shelfthread.com are one site, so the web app's own calls still carry it.
export function setSessionCookie(req: FastifyRequest, reply: FastifyReply, name: string, path: string, token: string): void {
  const secure = req.protocol === "https" ? "; Secure" : "";
  reply.header("Set-Cookie", `${name}=${token}; Path=${path}; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE_S}${secure}`);
}

export function clearSessionCookie(reply: FastifyReply, name: string, path: string): void {
  reply.header("Set-Cookie", `${name}=; Path=${path}; HttpOnly; SameSite=Strict; Max-Age=0`);
}
