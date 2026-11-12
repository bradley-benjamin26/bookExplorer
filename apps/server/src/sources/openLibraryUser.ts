import { USER_AGENT } from "./openLibrary.js";

export class OpenLibraryAuthError extends Error {
  constructor(message = "Open Library rejected the credentials") {
    super(message);
    this.name = "OpenLibraryAuthError";
  }
}

export class OpenLibraryRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(`Open Library rate limit hit; retry in ${retryAfterSeconds}s`);
    this.name = "OpenLibraryRateLimitError";
  }
}

// Plain fetch, as hardcover.ts does: fetchWithTimeout replays POSTs on 5xx and turns one user's 429 into a host-wide cooldown. Never logs bodies, keys or cookies.
async function olFetch(path: string, init: RequestInit & { cookie?: string } = {}): Promise<Response> {
  const { cookie, headers, ...rest } = init;
  const res = await fetch(`https://openlibrary.org${path}`, {
    ...rest,
    signal: AbortSignal.timeout(10_000),
    headers: { "User-Agent": USER_AGENT, ...(cookie ? { Cookie: cookie } : {}), ...(headers as Record<string, string>) },
  });
  if (res.status === 429) throw new OpenLibraryRateLimitError(Number(res.headers.get("Retry-After")) || 60);
  if (res.status === 401 || res.status === 403) throw new OpenLibraryAuthError();
  return res;
}

export async function login(accessKey: string, secretKey: string): Promise<{ cookie: string; username: string }> {
  const res = await olFetch("/account/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access: accessKey, secret: secretKey }),
  });
  // Rejected keys come back as 400 invalid_s3keys.
  if (res.status === 400) throw new OpenLibraryAuthError();
  if (!res.ok) throw new Error(`Open Library login failed with ${res.status}`);
  // Only the session pair is kept; the other cookies (s3, pd, sfw) aren't needed.
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("session="))?.split(";")[0];
  if (!cookie) throw new OpenLibraryAuthError("Open Library returned no session");
  const value = decodeURIComponent(cookie.slice("session=".length)).replace(/^"|"$/g, "");
  const username = /^\/people\/([^,]+),/.exec(value)?.[1];
  if (!username) throw new OpenLibraryAuthError("Open Library returned an unreadable session");
  return { cookie, username };
}
