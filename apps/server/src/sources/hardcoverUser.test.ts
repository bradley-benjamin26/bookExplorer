import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./hardcover.js", () => ({ hardcoverGraphql: vi.fn() }));
import { hardcoverGraphql } from "./hardcover.js";
import { addListBook, createList, findBookId, listBooks, myLists, readingProgress, removeListBook } from "./hardcoverUser.js";

const gql = vi.mocked(hardcoverGraphql);
beforeEach(() => gql.mockReset());

const progress = (status_id: number, extra = {}) =>
  gql.mockResolvedValue({ me: [{ user_books: [{ status_id, edition: { pages: 300 }, book: { pages: 300 }, user_book_reads: [{ progress_pages: 120 }], ...extra }] }] });

describe("hardcoverUser", () => {
  it("findBookId sends every ISBN in one query and caches", async () => {
    gql.mockResolvedValue({ editions: [{ book_id: "42" }] });
    expect(await findBookId(["B", "A"], "T")).toBe(42);
    expect(await findBookId(["A", "B"], "T")).toBe(42);
    expect(gql).toHaveBeenCalledTimes(1);
    expect(gql.mock.calls[0][1]).toEqual({ isbns: ["A", "B"] });
  });

  it("listBooks prefers the listed edition's ISBN, then the default physical edition", async () => {
    gql.mockResolvedValue({
      lists_by_pk: {
        name: "L",
        description: null,
        list_books: [
          { book_id: 1, book: { title: "A", default_physical_edition: { isbn_13: "D13", isbn_10: null } }, edition: { isbn_13: null, isbn_10: "E10" } },
          { book_id: "2", book: { title: "B", default_physical_edition: { isbn_13: null, isbn_10: "D10" } }, edition: null },
        ],
      },
    });
    expect((await listBooks(1, "T"))?.books).toEqual([
      { hardcoverBookId: 1, title: "A", isbn: "E10" },
      { hardcoverBookId: 2, title: "B", isbn: "D10" },
    ]);
  });

  it("listBooks yields isbn null when no edition has one", async () => {
    gql.mockResolvedValue({ lists_by_pk: { name: "L", description: "d", list_books: [{ book_id: 1, book: { title: "A", default_physical_edition: null }, edition: null }] } });
    expect((await listBooks(1, "T"))?.books[0].isbn).toBeNull();
  });

  it("myLists normalises ids and counts", async () => {
    gql.mockResolvedValue({ me: [{ lists: [{ id: "5", name: "N", description: null, books_count: "3" }] }] });
    expect(await myLists("T")).toEqual([{ id: 5, name: "N", description: "", booksCount: 3 }]);
  });

  it("createList throws when no id comes back", async () => {
    gql.mockResolvedValue({ insert_list: { id: null } });
    await expect(createList({ name: "n", description: "" }, "T")).rejects.toThrow();
    gql.mockResolvedValue({ insert_list: { id: "9" } });
    expect(await createList({ name: "n", description: "" }, "T")).toBe(9);
  });

  it("addListBook sends no position", async () => {
    gql.mockResolvedValue({});
    await addListBook(1, 2, "T");
    expect(gql.mock.calls[0][0]).not.toContain("position");
  });

  it("readingProgress: reading 120/300 → 40%", async () => {
    progress(2);
    expect(await readingProgress(1, "B")).toEqual({ status: "reading", percent: 40 });
  });

  it("readingProgress: read → percent null", async () => {
    progress(3);
    expect(await readingProgress(1, "B")).toEqual({ status: "read", percent: null });
  });

  it("readingProgress: ignored or not shelved → nulls", async () => {
    progress(6);
    expect(await readingProgress(1, "B")).toEqual({ status: null, percent: null });
    gql.mockResolvedValue({ me: [{ user_books: [] }] });
    expect(await readingProgress(1, "B")).toEqual({ status: null, percent: null });
  });

  it("removeListBook with no matching row makes no delete call", async () => {
    gql.mockResolvedValue({ list_books: [] });
    await removeListBook(1, 2, "T");
    expect(gql).toHaveBeenCalledTimes(1);
  });

  it("removeListBook deletes each matching row", async () => {
    gql.mockResolvedValueOnce({ list_books: [{ id: 7 }, { id: "8" }] }).mockResolvedValue({});
    await removeListBook(1, 2, "T");
    expect(gql.mock.calls.slice(1).map((c) => c[1])).toEqual([{ id: 7 }, { id: 8 }]);
  });
});
