import { beforeEach, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "../httpClient.js";
import { OpenLibraryAuthError, OpenLibraryRateLimitError, login } from "./openLibraryUser.js";

vi.mock("../httpClient.js", async () => ({
  ...(await vi.importActual<typeof import("../httpClient.js")>("../httpClient.js")),
  fetchWithTimeout: vi.fn(),
}));

beforeEach(() => vi.mocked(fetchWithTimeout).mockReset());

const withCookies = (...cookies: string[]) => {
  const h = new Headers();
  for (const c of cookies) h.append("Set-Cookie", c);
  return new Response("{}", { status: 200, headers: h });
};

it("login posts the keys as JSON with the User-Agent and returns cookie and username", async () => {
  vi.mocked(fetchWithTimeout).mockResolvedValue(
    withCookies("s3=x; Path=/", "session=/people/ada%2C2026-11-12%2Cabc; Path=/; SameSite=Lax", "pd=1; Path=/"),
  );
  expect(await login("AKEY", "SKEY")).toEqual({ cookie: "session=/people/ada%2C2026-11-12%2Cabc", username: "ada" });
  const [url, init] = vi.mocked(fetchWithTimeout).mock.calls[0];
  expect(url).toBe("https://openlibrary.org/account/login");
  expect(init!.method).toBe("POST");
  expect(JSON.parse(init!.body as string)).toEqual({ access: "AKEY", secret: "SKEY" });
  expect((init!.headers as Record<string, string>)["User-Agent"]).toMatch(/^BookExplorer/);
});

it("still parses a quoted cookie value and usernames with underscores", async () => {
  vi.mocked(fetchWithTimeout).mockResolvedValue(withCookies('session="/people/ada_l%2C2026-11-12%2Cabc"; Path=/'));
  expect(await login("A", "S")).toEqual({ cookie: 'session="/people/ada_l%2C2026-11-12%2Cabc"', username: "ada_l" });
});

it.each([400, 401, 403])("login throws OpenLibraryAuthError on a %i", async (status) => {
  vi.mocked(fetchWithTimeout).mockResolvedValue(new Response('{"error":"invalid_s3keys"}', { status }));
  await expect(login("A", "S")).rejects.toBeInstanceOf(OpenLibraryAuthError);
});

it("a 200 without a session cookie is an auth error", async () => {
  vi.mocked(fetchWithTimeout).mockResolvedValue(withCookies("s3=x; Path=/"));
  await expect(login("A", "S")).rejects.toBeInstanceOf(OpenLibraryAuthError);
});

it("maps 429 to OpenLibraryRateLimitError with Retry-After, defaulting to 60", async () => {
  vi.mocked(fetchWithTimeout).mockResolvedValueOnce(new Response("", { status: 429, headers: { "Retry-After": "30" } }));
  await expect(login("A", "S")).rejects.toMatchObject({ retryAfterSeconds: 30 });
  vi.mocked(fetchWithTimeout).mockResolvedValueOnce(new Response("", { status: 429 }));
  await expect(login("A", "S")).rejects.toBeInstanceOf(OpenLibraryRateLimitError);
  vi.mocked(fetchWithTimeout).mockResolvedValueOnce(new Response("", { status: 429 }));
  await expect(login("A", "S")).rejects.toMatchObject({ retryAfterSeconds: 60 });
});
