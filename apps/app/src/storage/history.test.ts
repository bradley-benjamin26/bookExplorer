import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "../test/asyncStorageMock";
import { addRecent, getRecent, recentOfKind, type RecentItem } from "./history";

vi.mock("@react-native-async-storage/async-storage", () => import("../test/asyncStorageMock"));

const book = (id: string, title: string | null = null): RecentItem => ({ kind: "book", id, title, subtitle: null });

describe("history", () => {
  beforeEach(() => AsyncStorage.clear());

  it("moves a repeated item to the front instead of duplicating it", async () => {
    await addRecent(book("1"));
    await addRecent(book("2"));
    await addRecent(book("1"));
    expect((await getRecent()).map((b) => b.id)).toEqual(["1", "2"]);
  });

  it("keeps only the 30 most recent", async () => {
    for (let i = 0; i < 35; i++) await addRecent(book(String(i)));
    const recent = await getRecent();
    expect(recent).toHaveLength(30);
    expect(recent[0].id).toBe("34");
  });

  it("keeps both entries when two adds overlap", async () => {
    await Promise.all([addRecent(book("1")), addRecent(book("2"))]);
    expect((await getRecent()).map((b) => b.id)).toEqual(expect.arrayContaining(["1", "2"]));
  });

  it("reads legacy entries as books", async () => {
    await AsyncStorage.setItem("book-explorer:recent-isbns", JSON.stringify(["9780441172719", { isbn: "9780547928227", title: "The Hobbit", authorNames: ["J.R.R. Tolkien"] }]));
    expect(await getRecent()).toEqual([
      { kind: "book", id: "9780441172719", title: null, subtitle: null },
      { kind: "book", id: "9780547928227", title: "The Hobbit", subtitle: "J.R.R. Tolkien" },
    ]);
  });

  it("re-adding an item replaces its old entry with the new title", async () => {
    await addRecent(book("1"));
    await addRecent({ kind: "book", id: "1", title: "Dune", subtitle: "Frank Herbert" });
    expect(await getRecent()).toEqual([{ kind: "book", id: "1", title: "Dune", subtitle: "Frank Herbert" }]);
  });

  it("dedupes on kind and id, newest first", async () => {
    await addRecent({ kind: "author", id: "OL1A", title: "A", subtitle: null });
    await addRecent({ kind: "work", id: "OL1A", title: "W", subtitle: null }); // same id, different kind: kept
    await addRecent({ kind: "author", id: "OL1A", title: "A", subtitle: null });
    expect((await getRecent()).map((r) => `${r.kind}:${r.id}`)).toEqual(["author:OL1A", "work:OL1A"]);
  });

  it("filters books to books and works", () => {
    const items = [{ kind: "book" }, { kind: "work" }, { kind: "author" }, { kind: "subject" }].map((k, i) => ({ ...k, id: String(i), title: null, subtitle: null }) as RecentItem);
    expect(recentOfKind(items, "books").map((r) => r.kind)).toEqual(["book", "work"]);
  });
});
