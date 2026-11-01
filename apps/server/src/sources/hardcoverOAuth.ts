import { createHash } from "node:crypto";
import type { HardcoverTokens } from "../accountStore.js";
import { fetchWithTimeout } from "../httpClient.js";
import { randomToken } from "../secretBox.js";

export const HARDCOVER_ISSUER = "https://api.hardcover.app";
export const HARDCOVER_SCOPES = "read:me:content read:catalog read:lists write:lists read:library";
const AUTHORIZE_URL = "https://hardcover.app/oauth2/authorize";
const TOKEN_URL = `${HARDCOVER_ISSUER}/oauth2/token`;
const REVOKE_URL = `${HARDCOVER_ISSUER}/oauth2/revoke`;
const GRAPHQL_URL = `${HARDCOVER_ISSUER}/v1/graphql`;

export class HardcoverAuthRevokedError extends Error {}

const env = () => ({
  id: process.env.MY_HARDCOVER_CLIENT_ID ?? "",
  secret: process.env.MY_HARDCOVER_CLIENT_SECRET ?? "",
  redirect: process.env.HARDCOVER_REDIRECT_URI ?? "",
});

export function newPkce() {
  const verifier = randomToken(32);
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function authorizeUrl(p: { state: string; challenge: string }): string {
  const e = env();
  const q = new URLSearchParams({ response_type: "code", client_id: e.id, redirect_uri: e.redirect, state: p.state, code_challenge: p.challenge, code_challenge_method: "S256", scope: HARDCOVER_SCOPES });
  return `${AUTHORIZE_URL}?${q}`;
}

// Plain fetch, not fetchWithTimeout: it retries 5xx, and Hardcover rotates refresh tokens, so a retried
// refresh reuses a spent token and revokes the whole chain.
function tokenPost(url: string, form: Record<string, string>): Promise<Response> {
  const e = env();
  return fetch(url, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${e.id}:${e.secret}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(10_000),
  });
}

async function readTokens(res: Response): Promise<HardcoverTokens> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    if (res.status === 401 || (res.status === 400 && body?.error === "invalid_grant")) throw new HardcoverAuthRevokedError("Hardcover authorization revoked");
    throw new Error(`Hardcover token endpoint returned ${res.status}`);
  }
  const j = (await res.json()) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
  if (typeof j.access_token !== "string" || typeof j.refresh_token !== "string" || typeof j.expires_in !== "number") throw new Error("Hardcover token response malformed");
  return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: Date.now() + j.expires_in * 1000 };
}

export async function exchangeCode(code: string, verifier: string): Promise<HardcoverTokens> {
  return readTokens(await tokenPost(TOKEN_URL, { grant_type: "authorization_code", code, redirect_uri: env().redirect, code_verifier: verifier }));
}

export async function refreshTokens(refreshToken: string): Promise<HardcoverTokens> {
  return readTokens(await tokenPost(TOKEN_URL, { grant_type: "refresh_token", refresh_token: refreshToken }));
}

export async function revokeToken(token: string): Promise<void> {
  try {
    await tokenPost(REVOKE_URL, { token });
  } catch {
    // best effort
  }
}

export async function fetchMe(accessToken: string): Promise<{ id: number; username: string }> {
  const res = await fetchWithTimeout(GRAPHQL_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "{ me { id username } }" }),
  });
  if (!res.ok) throw new Error(`Hardcover me query returned ${res.status}`);
  const j = (await res.json()) as { errors?: unknown; data?: { me?: { id: number; username: string }[] } };
  const me = j.data?.me?.[0];
  if (j.errors || !me) throw new Error("Hardcover me query failed");
  return { id: me.id, username: me.username };
}
