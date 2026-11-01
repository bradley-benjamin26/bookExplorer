import Fastify from "fastify";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getSession } from "../accountStore.js";
import { getBookDetail } from "../services/bookService.js";
import { booksRoutes } from "./books.js";

vi.mock("../services/bookService.js", () => ({ getBookDetail: vi.fn() }));
// The real hardcoverAccount runs on a mocked store, so its error handling is under test too.
vi.mock("../accountStore.js", () => ({ accountStoreOpen: () => true, getSession: vi.fn(), deleteSession: vi.fn(), updateTokens: vi.fn() }));

beforeEach(() => {
  vi.mocked(getBookDetail).mockReset().mockResolvedValue({ title: "T" } as never);
  for (const k of ["MY_HARDCOVER_CLIENT_ID", "MY_HARDCOVER_CLIENT_SECRET", "HARDCOVER_REDIRECT_URI", "HARDCOVER_TOKEN_KEY", "ACCOUNT_DB_PATH"]) vi.stubEnv(k, "x");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(getSession).mockReset();
  vi.restoreAllMocks();
});

async function get(headers: Record<string, string>) {
  const app = Fastify();
  await app.register(booksRoutes);
  const res = await app.inject({ method: "GET", url: "/api/books/isbn/9780306406157", headers });
  await app.close();
  return res;
}

it("passes the session's authorization into getBookDetail", async () => {
  vi.mocked(getSession).mockReturnValue({ accessToken: "user", refreshToken: "r", expiresAt: Date.now() + 864e5, hardcoverUserId: 1, username: "u" });
  const res = await get({ "x-hardcover-session": "sess" });
  expect(res.statusCode).toBe(200);
  expect(getSession).toHaveBeenCalledWith("sess");
  expect(getBookDetail).toHaveBeenCalledWith("9780306406157", "Bearer user");
});

it("passes null when signed out", async () => {
  await get({});
  expect(getBookDetail).toHaveBeenCalledWith("9780306406157", null);
});

it("falls back to the server key when the account lookup throws", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(getSession).mockImplementation(() => {
    throw new Error("Account store is not open");
  });
  const res = await get({ "x-hardcover-session": "sess" });
  expect(res.statusCode).toBe(200);
  expect(getBookDetail).toHaveBeenCalledWith("9780306406157", null);
});

it("skips the account lookup when the feature is off", async () => {
  vi.unstubAllEnvs();
  const res = await get({ "x-hardcover-session": "sess" });
  expect(res.statusCode).toBe(200);
  expect(getSession).not.toHaveBeenCalled();
  expect(getBookDetail).toHaveBeenCalledWith("9780306406157", null);
});
