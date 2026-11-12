import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "../httpClient.js";
import { OpenLibraryAuthError, OpenLibraryRateLimitError, createList, getList, login, memberFor, myLists, seedFor, updateSeeds } from "./openLibraryUser.js";

vi.mock("../httpClient.js", async () => ({
  ...(await vi.importActual<typeof import("../httpClient.js")>("../httpClient.js")),
  fetchWithTimeout: vi.fn(),
}));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.mocked(fetchWithTimeout).mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const withCookies = (...cookies: string[]) => {
  const h = new Headers();
  for (const c of cookies) h.append("Set-Cookie", c);
  return new Response("{}", { status: 200, headers: h });
};

it("login posts the keys as JSON with the User-Agent and returns cookie and username", async () => {
  fetchMock.mockResolvedValue(
    withCookies("s3=x; Path=/", "session=/people/ada%2C2026-11-12%2Cabc; Path=/; SameSite=Lax", "pd=1; Path=/"),
  );
  expect(await login("AKEY", "SKEY")).toEqual({ cookie: "session=/people/ada%2C2026-11-12%2Cabc", username: "ada" });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://openlibrary.org/account/login");
  expect(init!.method).toBe("POST");
  expect(fetchWithTimeout).not.toHaveBeenCalled();
  expect(JSON.parse(init!.body as string)).toEqual({ access: "AKEY", secret: "SKEY" });
  expect((init!.headers as Record<string, string>)["User-Agent"]).toMatch(/^BookExplorer/);
});

it("still parses a quoted cookie value and usernames with underscores", async () => {
  fetchMock.mockResolvedValue(withCookies('session="/people/ada_l%2C2026-11-12%2Cabc"; Path=/'));
  expect(await login("A", "S")).toEqual({ cookie: 'session="/people/ada_l%2C2026-11-12%2Cabc"', username: "ada_l" });
});

it.each([400, 401, 403])("login throws OpenLibraryAuthError on a %i", async (status) => {
  fetchMock.mockResolvedValue(new Response('{"error":"invalid_s3keys"}', { status }));
  await expect(login("A", "S")).rejects.toBeInstanceOf(OpenLibraryAuthError);
});

it("a 200 without a session cookie is an auth error", async () => {
  fetchMock.mockResolvedValue(withCookies("s3=x; Path=/"));
  await expect(login("A", "S")).rejects.toBeInstanceOf(OpenLibraryAuthError);
});

it("maps 429 to OpenLibraryRateLimitError with Retry-After, defaulting to 60", async () => {
  fetchMock.mockResolvedValueOnce(new Response("", { status: 429, headers: { "Retry-After": "30" } }));
  await expect(login("A", "S")).rejects.toMatchObject({ retryAfterSeconds: 30 });
  fetchMock.mockResolvedValueOnce(new Response("", { status: 429 }));
  await expect(login("A", "S")).rejects.toBeInstanceOf(OpenLibraryRateLimitError);
  fetchMock.mockResolvedValueOnce(new Response("", { status: 429 }));
  await expect(login("A", "S")).rejects.toMatchObject({ retryAfterSeconds: 60 });
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

it("seedFor maps works and authors without a request", async () => {
  expect(await seedFor({ type: "work", id: "OL45804W" })).toBe("/works/OL45804W");
  expect(await seedFor({ type: "author", id: "OL23919A" })).toBe("/authors/OL23919A");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("seedFor resolves an ISBN to its first record key and caches it", async () => {
  fetchMock.mockResolvedValue(json({ records: { "/books/OL7353617M": {}, "/books/OL1M": {} } }));
  expect(await seedFor({ type: "book", id: "9780000000011" })).toBe("/books/OL7353617M");
  expect(await seedFor({ type: "book", id: "9780000000011" })).toBe("/books/OL7353617M");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe("https://openlibrary.org/api/volumes/brief/isbn/9780000000011.json");
  expect(fetchMock.mock.calls[0][1]!.headers).not.toHaveProperty("Cookie");
});

it("seedFor returns null (cached) for an ISBN Open Library doesn't have", async () => {
  fetchMock.mockResolvedValue(json([]));
  expect(await seedFor({ type: "book", id: "9780000000022" })).toBeNull();
  expect(await seedFor({ type: "book", id: "9780000000022" })).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("memberFor maps an edition to its ISBN-13, else ISBN-10", async () => {
  fetchMock.mockResolvedValueOnce(json({ isbn_13: ["9780140328721"], isbn_10: ["0140328726"] }));
  expect(await memberFor("/books/OL1M")).toEqual({ type: "book", id: "9780140328721" });
  fetchMock.mockResolvedValueOnce(json({ isbn_10: ["0140328726"] }));
  expect(await memberFor("/books/OL2M")).toEqual({ type: "book", id: "0140328726" });
  expect(await memberFor("/works/OL3W")).toEqual({ type: "work", id: "OL3W" });
  expect(await memberFor("/authors/OL4A")).toEqual({ type: "author", id: "OL4A" });
});

it("memberFor returns null for subjects and ISBN-less editions", async () => {
  expect(await memberFor("/subjects/cats")).toBeNull();
  fetchMock.mockResolvedValueOnce(json({ title: "x" }));
  expect(await memberFor("/books/OL5M")).toBeNull();
});

it("myLists returns id, name and seedCount", async () => {
  fetchMock.mockResolvedValue(json({ entries: [{ url: "/people/a%20b/lists/OL9L", name: "Faves", seed_count: 3 }] }));
  expect(await myLists("a b")).toEqual([{ id: "OL9L", name: "Faves", seedCount: 3 }]);
  expect(fetchMock.mock.calls[0][0]).toBe("https://openlibrary.org/people/a%20b/lists.json");
});

it("getList reads the list and follows links.next until every seed is read", async () => {
  fetchMock
    .mockResolvedValueOnce(json({ name: "L", description: null, seed_count: 2 }))
    .mockResolvedValueOnce(json({ links: { next: "/people/ada/lists/OL9L/seeds.json?offset=1" }, entries: [{ url: "/works/OL7W", title: "A", type: "work" }] }))
    .mockResolvedValueOnce(json({ links: {}, entries: [{ url: "/subjects/x", title: "B", type: "subject" }] }));
  expect(await getList("ada", "OL9L")).toEqual({
    name: "L",
    description: "",
    seedCount: 2,
    seeds: [
      { seed: "/works/OL7W", title: "A", member: { type: "work", id: "OL7W" } },
      { seed: "/subjects/x", title: "B", member: null },
    ],
  });
  expect(fetchMock.mock.calls[2][0]).toBe("https://openlibrary.org/people/ada/lists/OL9L/seeds.json?offset=1");
});

it("getList returns null on 404 and throws on a failing seeds page", async () => {
  fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));
  expect(await getList("ada", "OL1L")).toBeNull();
  fetchMock
    .mockResolvedValueOnce(json({ name: "L", description: "", seed_count: 1 }))
    .mockResolvedValueOnce(new Response("", { status: 500 }));
  await expect(getList("ada", "OL1L")).rejects.toThrow();
});

it("createList posts the cookie and returns the new id", async () => {
  fetchMock.mockResolvedValue(json({ key: "/people/ada/lists/OL357393L", revision: 1 }));
  expect(await createList("ada", { name: "N", description: "D" }, "session=c")).toBe("OL357393L");
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://openlibrary.org/people/ada/lists.json");
  expect((init!.headers as Record<string, string>).Cookie).toBe("session=c");
  expect(JSON.parse(init!.body as string)).toEqual({ name: "N", description: "D", seeds: [] });
});

it("updateSeeds sends the cookie and the add/remove body", async () => {
  fetchMock.mockResolvedValue(json({}));
  await updateSeeds("ada", "OL9L", { add: ["/works/OL1W"], remove: ["/works/OL2W"] }, "session=c");
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://openlibrary.org/people/ada/lists/OL9L/seeds.json");
  expect((init!.headers as Record<string, string>).Cookie).toBe("session=c");
  expect(JSON.parse(init!.body as string)).toEqual({ add: [{ key: "/works/OL1W" }], remove: ["/works/OL2W"] });
});

it("updateSeeds throws OpenLibraryAuthError on an expired cookie", async () => {
  fetchMock.mockResolvedValue(json({ detail: "Authentication required" }, 401));
  await expect(updateSeeds("ada", "OL9L", { add: [], remove: ["/works/OL2W"] }, "session=c")).rejects.toBeInstanceOf(OpenLibraryAuthError);
});
