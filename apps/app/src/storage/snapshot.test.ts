import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "../test/asyncStorageMock";
import { upsertLibrary } from "./librarySettings";
import { getSavedBook, removeSavedBook, updateSavedBook } from "./savedBooks";
import { getSavedItems, isItemSaved, removeSaved, toggleSaved } from "./savedItems";
import { addToList, createList } from "./savedLists";
import { getSavedWork, updateSavedWork } from "./savedWorks";
import { applySnapshot, getSnapshot, migrateStorage } from "./snapshot";

vi.mock("@react-native-async-storage/async-storage", () => import("../test/asyncStorageMock"));

const legacyBook = { isbn: "1", title: "Old", authorNames: [], subjects: [], genres: [], notes: "n", savedAt: 1234 };

describe("snapshot", () => {
  beforeEach(() => AsyncStorage.clear());

  it("migrates unversioned data once, keeping savedAt as updatedAt", async () => {
    await AsyncStorage.setItem("book-explorer:saved-items", JSON.stringify([{ type: "book", id: "1", title: "Old" }]));
    await AsyncStorage.setItem("book-explorer:saved-book:1", JSON.stringify(legacyBook));
    await AsyncStorage.setItem("book-explorer:libraries", JSON.stringify([{ id: "a", name: "A", isbnUrl: "x", titleUrl: "" }]));
    await migrateStorage();
    const first = await getSnapshot();
    expect(first.books[0]).toMatchObject({ schemaVersion: 3, updatedAt: 1234, notes: "n" });
    expect(first.items[0].schemaVersion).toBe(3);
    expect(first.libraries[0].schemaVersion).toBe(3);
    await migrateStorage();
    expect(await getSnapshot()).toEqual(first);
  });

  it("migration v1 -> v2 gives each live saved work a minimal record, once", async () => {
    const v1Item = (id: string, extra = {}) => ({ schemaVersion: 1, updatedAt: 100, type: "work", id, title: `T${id}`, ...extra });
    await AsyncStorage.setItem(
      "book-explorer:saved-items",
      JSON.stringify([v1Item("OL1W"), v1Item("OL2W", { deletedAt: 100 }), v1Item("legacy/id"), { ...v1Item("9"), type: "book" }])
    );
    await AsyncStorage.setItem("book-explorer:schema-version", "1");
    await migrateStorage();
    const { works } = await getSnapshot();
    expect(works).toEqual([
      { schemaVersion: 3, updatedAt: 100, openLibraryWorkId: "OL1W", title: "TOL1W", authorNames: [], subjects: [], genres: [], notes: "", savedAt: 100 },
    ]);
    expect(await AsyncStorage.getItem("book-explorer:schema-version")).toBe("3");

    // Re-running (even forced past the version check) neither duplicates nor overwrites an edited record.
    await updateSavedWork("OL1W", { notes: "kept" });
    const edited = await getSnapshot();
    await migrateStorage();
    await AsyncStorage.setItem("book-explorer:schema-version", "1");
    await migrateStorage();
    expect(await getSnapshot()).toEqual(edited);
    expect((await getSavedWork("OL1W"))?.notes).toBe("kept");
  });

  it("migration v2 -> v3 keeps every record and starts with no lists", async () => {
    const work = { schemaVersion: 2, updatedAt: 100, openLibraryWorkId: "OL1W", title: "W", authorNames: [], subjects: [], genres: [], notes: "w", savedAt: 100 };
    await AsyncStorage.setItem("book-explorer:saved-items", JSON.stringify([{ schemaVersion: 2, updatedAt: 100, type: "work", id: "OL1W", title: "W" }]));
    await AsyncStorage.setItem("book-explorer:saved-work:OL1W", JSON.stringify(work));
    await AsyncStorage.setItem("book-explorer:saved-book:1", JSON.stringify({ ...legacyBook, schemaVersion: 2, updatedAt: 5 }));
    await AsyncStorage.setItem("book-explorer:schema-version", "2");
    const before = await getSnapshot();
    await migrateStorage();
    expect(await getSnapshot()).toEqual(before);
    expect(before).toMatchObject({ works: [work], lists: [] });
    expect(before.books[0]).toMatchObject({ notes: "n", schemaVersion: 2 });
    expect(await AsyncStorage.getItem("book-explorer:schema-version")).toBe("3");
  });

  it("round-trips through applySnapshot, replacing existing data", async () => {
    await toggleSaved({ type: "book", id: "1", title: "One" });
    await AsyncStorage.setItem("book-explorer:saved-book:1", JSON.stringify({ ...legacyBook, schemaVersion: 1, updatedAt: 5 }));
    await upsertLibrary({ id: "a", name: "A", isbnUrl: "x", titleUrl: "" });
    await toggleSaved({ type: "work", id: "OL1W", title: "W" });
    await migrateStorage(); // gives OL1W its record
    await updateSavedWork("OL1W", { notes: "w" });
    const list = await createList({ name: "L", kind: "book" });
    await addToList(list.id, { type: "work", id: "OL1W", title: "W" });
    const snap = await getSnapshot();
    expect(snap.lists).toMatchObject([{ id: list.id, members: [{ id: "OL1W" }] }]);
    expect(snap.works).toMatchObject([{ openLibraryWorkId: "OL1W", notes: "w" }]);
    await AsyncStorage.clear();
    await AsyncStorage.setItem("book-explorer:saved-work:stale", JSON.stringify({ openLibraryWorkId: "stale" }));
    await toggleSaved({ type: "work", id: "stale", title: "Stale" });
    await AsyncStorage.setItem("book-explorer:saved-book:stale", JSON.stringify({ ...legacyBook, isbn: "stale" }));
    await createList({ name: "Stale", kind: "author" });
    await applySnapshot(snap);
    expect(await getSnapshot()).toEqual(snap);
  });

  it("exports tombstones without the removed book's notes", async () => {
    await toggleSaved({ type: "book", id: "1", title: "One" });
    await AsyncStorage.setItem("book-explorer:saved-book:1", JSON.stringify({ ...legacyBook, schemaVersion: 1, updatedAt: 5 }));
    await removeSaved("book", "1");
    await removeSavedBook("1");
    const { books } = await getSnapshot();
    expect(books[0].deletedAt).toBeGreaterThan(0);
    expect(books[0].notes).toBe("");
  });

  it("excludes per-device data", async () => {
    await AsyncStorage.setItem("book-explorer:theme-preference", "dark");
    expect(Object.keys(await getSnapshot()).sort()).toEqual(["books", "items", "libraries", "lists", "schemaVersion", "works"]);
  });

  it("hides tombstoned items and books but keeps them in the snapshot", async () => {
    await toggleSaved({ type: "book", id: "1", title: "One" });
    await AsyncStorage.setItem("book-explorer:saved-book:1", JSON.stringify({ ...legacyBook, schemaVersion: 1, updatedAt: 5 }));
    await removeSaved("book", "1");
    await removeSavedBook("1");
    expect(await getSavedItems()).toEqual([]);
    expect(await isItemSaved("book", "1")).toBe(false);
    expect(await getSavedBook("1")).toBeNull();
    expect(await updateSavedBook("1", { notes: "x" })).toBeNull();
    const snap = await getSnapshot();
    expect(snap.items[0].deletedAt).toBeTypeOf("number");
    expect(snap.books[0].deletedAt).toBeTypeOf("number");
    expect(await toggleSaved({ type: "book", id: "1", title: "One" })).toBe(true);
    expect((await getSnapshot()).items).toHaveLength(1);
  });
});

describe("applySnapshot library writes", () => {
  beforeEach(() => AsyncStorage.clear());

  it("queues library replacement behind an in-flight upsert", async () => {
    const lib = (id: string) => ({ id, name: id, isbnUrl: "x", titleUrl: "" });
    const edit = upsertLibrary(lib("edit"));
    await applySnapshot({ schemaVersion: 3, items: [], books: [], works: [], lists: [], libraries: [{ ...lib("imported"), schemaVersion: 2, updatedAt: 1 }] });
    await edit;
    // The edit ran first, then the import replaced it; never the reverse interleaving.
    expect((await getSnapshot()).libraries.map((l) => l.id)).toEqual(["imported"]);
  });
});
