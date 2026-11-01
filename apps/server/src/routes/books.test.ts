import Fastify from "fastify";
import { beforeEach, expect, it, vi } from "vitest";
import { getBookDetail } from "../services/bookService.js";
import { userAuthorization } from "../services/hardcoverAccount.js";
import { booksRoutes } from "./books.js";

vi.mock("../services/bookService.js", () => ({ getBookDetail: vi.fn() }));
vi.mock("../services/hardcoverAccount.js", () => ({ userAuthorization: vi.fn() }));

beforeEach(() => vi.mocked(getBookDetail).mockReset());

async function get(headers: Record<string, string>) {
  const app = Fastify();
  await app.register(booksRoutes);
  const res = await app.inject({ method: "GET", url: "/api/books/isbn/9780306406157", headers });
  await app.close();
  return res;
}

it("passes the session's authorization into getBookDetail", async () => {
  vi.mocked(userAuthorization).mockResolvedValue("Bearer user");
  vi.mocked(getBookDetail).mockResolvedValue({ title: "T" } as never);
  const res = await get({ "x-hardcover-session": "sess" });
  expect(res.statusCode).toBe(200);
  expect(userAuthorization).toHaveBeenCalledWith("sess");
  expect(getBookDetail).toHaveBeenCalledWith("9780306406157", "Bearer user");
});

it("passes null when signed out", async () => {
  vi.mocked(userAuthorization).mockResolvedValue(null);
  vi.mocked(getBookDetail).mockResolvedValue({ title: "T" } as never);
  await get({});
  expect(getBookDetail).toHaveBeenCalledWith("9780306406157", null);
});
