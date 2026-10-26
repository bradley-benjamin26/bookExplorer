import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "../test/asyncStorageMock";
import { addRecentBook, getRecentBooks, type RecentBook } from "./history";

vi.mock("@react-native-async-storage/async-storage", () => import("../test/asyncStorageMock"));

const book = (isbn: string, title: string | null = null): RecentBook => ({ isbn, title, authorNames: [] });

describe("history", () => {
  beforeEach(() => AsyncStorage.clear());

  it("moves a repeated ISBN to the front instead of duplicating it", async () => {
    await addRecentBook(book("1"));
    await addRecentBook(book("2"));
    await addRecentBook(book("1"));
    expect((await getRecentBooks()).map((b) => b.isbn)).toEqual(["1", "2"]);
  });

  it("keeps only the 20 most recent", async () => {
    for (let i = 0; i < 25; i++) await addRecentBook(book(String(i)));
    const recent = await getRecentBooks();
    expect(recent).toHaveLength(20);
    expect(recent[0].isbn).toBe("24");
  });

  it("keeps both entries when two adds overlap", async () => {
    await Promise.all([addRecentBook(book("1")), addRecentBook(book("2"))]);
    expect((await getRecentBooks()).map((b) => b.isbn)).toEqual(expect.arrayContaining(["1", "2"]));
  });

  it("reads a legacy string[] history as untitled entries", async () => {
    await AsyncStorage.setItem("book-explorer:recent-isbns", '["123"]');
    expect(await getRecentBooks()).toEqual([{ isbn: "123", title: null, authorNames: [] }]);
  });

  it("re-adding an ISBN replaces its old entry with the new title", async () => {
    await addRecentBook(book("1"));
    await addRecentBook({ isbn: "1", title: "Dune", authorNames: ["Frank Herbert"] });
    expect(await getRecentBooks()).toEqual([{ isbn: "1", title: "Dune", authorNames: ["Frank Herbert"] }]);
  });
});
