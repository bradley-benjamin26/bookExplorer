import { accountStoreOpen, createOlSession, deleteOlSession, getOlSession, updateOlCookie } from "../accountStore.js";
import { randomToken } from "../secretBox.js";
import { OpenLibraryAuthError, login } from "../sources/openLibraryUser.js";

export class OpenLibrarySignedOutError extends Error {}

// Reuses the Hardcover key: no new env vars.
export const openLibraryEnabled = (): boolean => !!process.env.HARDCOVER_TOKEN_KEY && accountStoreOpen();

export async function connect(accessKey: string, secretKey: string): Promise<{ token: string; username: string }> {
  const { cookie, username } = await login(accessKey, secretKey); // throws OpenLibraryAuthError on rejected keys; nothing stored
  const token = randomToken();
  createOlSession(token, { username, accessKey, secretKey, cookie });
  return { token, username };
}

export async function asUser<T>(sessionToken: unknown, run: (s: { username: string; cookie: string }) => Promise<T>): Promise<T> {
  const s = typeof sessionToken === "string" ? getOlSession(sessionToken) : null;
  if (typeof sessionToken !== "string" || !s) throw new OpenLibrarySignedOutError("Not signed in");
  const signOut = (): never => {
    deleteOlSession(sessionToken);
    throw new OpenLibrarySignedOutError("Open Library session expired");
  };
  try {
    return await run({ username: s.username, cookie: s.cookie });
  } catch (err) {
    if (!(err instanceof OpenLibraryAuthError)) throw err;
  }
  // shortcut: two requests on an expired cookie may both log in; harmless because cookies don't rotate. Add a single-flight map like hardcoverAccount's if Open Library starts limiting logins
  let fresh: { cookie: string; username: string };
  try {
    fresh = await login(s.accessKey, s.secretKey);
  } catch (err) {
    if (err instanceof OpenLibraryAuthError) return signOut();
    throw err;
  }
  updateOlCookie(sessionToken, fresh.cookie);
  try {
    return await run({ username: s.username, cookie: fresh.cookie });
  } catch (err) {
    if (err instanceof OpenLibraryAuthError) return signOut();
    throw err;
  }
}

export function getOpenLibraryAccount(sessionToken: unknown): { username: string } | null {
  const s = typeof sessionToken === "string" ? getOlSession(sessionToken) : null;
  return s ? { username: s.username } : null;
}

export function disconnectOpenLibrary(sessionToken: unknown): void {
  if (typeof sessionToken === "string") deleteOlSession(sessionToken);
}
