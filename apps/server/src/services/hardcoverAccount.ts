import {
  accountStoreOpen, createSession, deleteSession, getSession, savePending, saveHandoff, takeHandoff, takePending, updateTokens,
} from "../accountStore.js";
import { randomToken } from "../secretBox.js";
import { DEFAULT_WEB_ORIGIN } from "../socialMeta.js";
import {
  HARDCOVER_ISSUER, HardcoverAuthRevokedError, authorizeUrl, exchangeCode, fetchMe, newPkce, refreshTokens, revokeToken,
} from "../sources/hardcoverOAuth.js";

export class InvalidReturnUrlError extends Error {}
export class ExpiredCallbackError extends Error {}

const REFRESH_MARGIN_MS = 5 * 60_000;
const REQUIRED_ENV = ["MY_HARDCOVER_CLIENT_ID", "MY_HARDCOVER_CLIENT_SECRET", "HARDCOVER_REDIRECT_URI", "HARDCOVER_TOKEN_KEY", "ACCOUNT_DB_PATH"];

export const accountEnabled = (): boolean => REQUIRED_ENV.every((k) => process.env[k]) && accountStoreOpen();

function allowedPrefixes(): string[] {
  const custom = process.env.HARDCOVER_RETURN_URLS;
  if (custom) return custom.split(",").map((s) => s.trim()).filter(Boolean);
  const web = (process.env.PUBLIC_WEB_URL || DEFAULT_WEB_ORIGIN).replace(/\/$/, "");
  return ["bookexplorer://", `${web}/`];
}

export function startConnect(returnTo: string): string {
  if (!allowedPrefixes().some((p) => returnTo.startsWith(p))) throw new InvalidReturnUrlError("Return URL not allowed");
  const { verifier, challenge } = newPkce();
  const state = randomToken(24);
  savePending(state, { verifier, returnTo });
  return authorizeUrl({ state, challenge });
}

const withParam = (url: string, param: string) => `${url}${url.includes("?") ? "&" : "?"}${param}`;

export async function completeConnect(query: { code?: string; state?: string; iss?: string; error?: string }): Promise<string> {
  const pending = query.state ? takePending(query.state) : null;
  if (!pending) throw new ExpiredCallbackError("Unknown or expired state");
  const { verifier, returnTo } = pending;
  // Checked before code: Hardcover's denial redirect carries error and no code.
  if (query.error) return withParam(returnTo, "error=denied");
  if (query.iss !== HARDCOVER_ISSUER || !query.code) return withParam(returnTo, "error=failed");
  try {
    const tokens = await exchangeCode(query.code, verifier);
    const me = await fetchMe(tokens.accessToken);
    const sessionToken = randomToken();
    createSession(sessionToken, { ...tokens, hardcoverUserId: me.id, username: me.username });
    const handoff = randomToken();
    saveHandoff(handoff, sessionToken);
    return withParam(returnTo, `handoff=${encodeURIComponent(handoff)}`);
  } catch (err) {
    console.error("Hardcover connect failed:", err instanceof Error ? err.message : "unknown error");
    return withParam(returnTo, "error=failed");
  }
}

export function redeemHandoff(code: string): { token: string; username: string } | null {
  const token = takeHandoff(code);
  const session = token ? getSession(token) : null;
  return token && session ? { token, username: session.username } : null;
}

// shortcut: in-process lock, assumes one server process; move to a DB lease if this ever runs as several instances
const refreshing = new Map<string, Promise<string>>();

async function refresh(sessionToken: string, refreshToken: string): Promise<string> {
  // Persist before use: the old refresh token is spent the moment Hardcover answers.
  const t = await refreshTokens(refreshToken);
  updateTokens(sessionToken, t);
  return t.accessToken;
}

export async function userAuthorization(sessionToken: unknown): Promise<string | null> {
  if (typeof sessionToken !== "string") return null;
  const s = getSession(sessionToken);
  if (!s) return null;
  if (s.expiresAt - Date.now() >= REFRESH_MARGIN_MS) return `Bearer ${s.accessToken}`;
  let p = refreshing.get(sessionToken);
  if (!p) {
    p = refresh(sessionToken, s.refreshToken).finally(() => refreshing.delete(sessionToken));
    refreshing.set(sessionToken, p);
  }
  try {
    return `Bearer ${await p}`;
  } catch (err) {
    if (!(err instanceof HardcoverAuthRevokedError)) throw err;
    deleteSession(sessionToken);
    return null;
  }
}

export const forgetSession = (sessionToken: string): void => deleteSession(sessionToken);

export function getAccount(sessionToken: unknown): { username: string } | null {
  const s = typeof sessionToken === "string" ? getSession(sessionToken) : null;
  return s ? { username: s.username } : null;
}

export async function disconnect(sessionToken: unknown): Promise<void> {
  if (typeof sessionToken !== "string") return;
  const s = getSession(sessionToken);
  if (!s) return;
  await revokeToken(s.refreshToken);
  deleteSession(sessionToken);
}
