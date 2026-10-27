import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "../test/asyncStorageMock";
import { upsertLibrary } from "./librarySettings";
import { getSavedBook, removeSavedBook, updateSavedBook } from "./savedBooks";
import { getSavedItems, isItemSaved, removeSaved, toggleSaved } from "./savedItems";
import { addToList, createList, getLists } from "./savedLists";
import { getSavedWork, updateSavedWork } from "./savedWorks";
import { applySnapshot, getSnapshot, migrateStorage, withListedSaves, type Snapshot } from "./snapshot";

vi.mock("@react-native-async-storage/async-storage", () => import("../test/asyncStorageMock"));

const legacyBook = { isbn: "1", title: "Old", authorNames: [], subjects: [], genres: [], notes: "n", savedAt: 1234 };

describe("snapshot", () => {
  beforeEach(() => AsyncStorage.clear());

  it("migrates unversioned data once, keeping savedAt as updatedAt", async () => {
    await AsyncStorage.setItem("book-explorer:saved-items", JSON.stringify([{ type: "book", id: "1", title: "Old" }]));
    await AsyncStorage.setItem("book-explorer:saved-book:1", JSON.stringify(legacyBook));
    await AsyncStorage.setItem("book-explorer:libraries", JSON.stringify([{ id: "a", name: "A", isbnUrl: "https://x/", titleUrl: "" }]));
    await migrateStorage();
    const first = await getSnapshot();
    expect(first.books[0]).toMatchObject({ schemaVersion: 4, updatedAt: 1234, notes: "n" });
    expect(first.items[0].schemaVersion).toBe(4);
    expect(first.libraries[0].schemaVersion).toBe(4);
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
      { schemaVersion: 4, updatedAt: 100, openLibraryWorkId: "OL1W", title: "TOL1W", authorNames: [], subjects: [], genres: [], notes: "", savedAt: 100 },
    ]);
    expect(await AsyncStorage.getItem("book-explorer:schema-version")).toBe("4");

    // Re-running (even forced past the version check) neither duplicates nor overwrites an edited record.
    await updateSavedWork("OL1W", { notes: "kept" });
    const edited = await getSnapshot();
    await migrateStorage();
    await AsyncStorage.setItem("book-explorer:schema-version", "1");
    await migrateStorage();
    expect(await getSnapshot()).toEqual(edited);
    expect((await getSavedWork("OL1W"))?.notes).toBe("kept");
  });

  it("migration v2 -> v3 keeps every record", async () => {
    const work = { schemaVersion: 2, updatedAt: 100, openLibraryWorkId: "OL1W", title: "W", authorNames: [], subjects: [], genres: [], notes: "w", savedAt: 100 };
    await AsyncStorage.setItem("book-explorer:saved-items", JSON.stringify([{ schemaVersion: 2, updatedAt: 100, type: "work", id: "OL1W", title: "W" }]));
    await AsyncStorage.setItem("book-explorer:saved-work:OL1W", JSON.stringify(work));
    await AsyncStorage.setItem("book-explorer:saved-book:1", JSON.stringify({ ...legacyBook, schemaVersion: 2, updatedAt: 5 }));
    await AsyncStorage.setItem("book-explorer:schema-version", "2");
    const before = await getSnapshot();
    await migrateStorage();
    const { lists, ...after } = await getSnapshot();
    const { lists: _, ...kept } = before;
    expect(after).toEqual(kept);
    expect(lists).toMatchObject([{ name: "Saved books", members: [{ id: "OL1W" }] }]);
    expect(before).toMatchObject({ works: [work] });
    expect(before.books[0]).toMatchObject({ notes: "n", schemaVersion: 2 });
    expect(await AsyncStorage.getItem("book-explorer:schema-version")).toBe("4");
  });

  it("round-trips through applySnapshot, replacing existing data", async () => {
    await toggleSaved({ type: "book", id: "1", title: "One" });
    await AsyncStorage.setItem("book-explorer:saved-book:1", JSON.stringify({ ...legacyBook, schemaVersion: 1, updatedAt: 5 }));
    await upsertLibrary({ id: "a", name: "A", isbnUrl: "https://x/", titleUrl: "" });
    await toggleSaved({ type: "work", id: "OL1W", title: "W" });
    await migrateStorage(); // gives OL1W its record
    await updateSavedWork("OL1W", { notes: "w" });
    const list = await createList({ name: "L", kind: "book" });
    await addToList(list.id, { type: "work", id: "OL1W", title: "W" });
    const snap = await getSnapshot();
    expect(snap.lists).toContainEqual(expect.objectContaining({ id: list.id, members: [expect.objectContaining({ id: "OL1W" })] }));
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

describe("v4 lists", () => {
  beforeEach(() => AsyncStorage.clear());

  it("v4 puts saved items that are on no list onto Saved books / Saved authors", async () => {
    await toggleSaved({ type: "book", id: "9780441013593", title: "Dune" });
    await toggleSaved({ type: "work", id: "OL1W", title: "Emma" });
    await toggleSaved({ type: "author", id: "OL1A", title: "Jane Austen" });
    const faves = await createList({ name: "Faves", kind: "book" });
    await addToList(faves.id, { type: "work", id: "OL1W", title: "Emma" });
    await AsyncStorage.setItem("book-explorer:schema-version", "3");
    await migrateStorage();
    const lists = await getLists();
    const books = lists.find((l) => l.name === "Saved books");
    expect(books?.members).toMatchObject([{ type: "book", id: "9780441013593" }]);
    expect(lists.find((l) => l.name === "Faves")?.members).toMatchObject([{ id: "OL1W" }]);
    expect(lists.find((l) => l.name === "Saved authors")?.members).toMatchObject([{ type: "author", id: "OL1A" }]);
    expect((await getSnapshot()).schemaVersion).toBe(4);
    expect(await AsyncStorage.getItem("book-explorer:schema-version")).toBe("4");
  });

  it("withListedSaves reuses an existing Saved books list and skips tombstones", () => {
    const item = (type: "book" | "work" | "author", id: string, extra = {}) => ({ schemaVersion: 3, updatedAt: 1, type, id, title: id, ...extra });
    const saved = { schemaVersion: 3, updatedAt: 1, id: "l1", name: "Saved books", description: "", kind: "book" as const, createdAt: 1, members: [] };
    const snap: Snapshot = {
      schemaVersion: 3,
      items: [item("book", "1"), item("book", "2", { deletedAt: 5 })],
      books: [],
      works: [],
      libraries: [],
      lists: [saved, { ...saved, id: "gone", deletedAt: 5 }],
    };
    const out = withListedSaves(snap, 10);
    expect(out.lists).toHaveLength(2);
    expect(out.lists[0].members).toMatchObject([{ type: "book", id: "1", addedAt: 10 }]);
    expect(withListedSaves(out, 20)).toEqual(out);
  });
});

describe("applySnapshot library writes", () => {
  beforeEach(() => AsyncStorage.clear());

  it("queues library replacement behind an in-flight upsert", async () => {
    const lib = (id: string) => ({ id, name: id, isbnUrl: "https://x/", titleUrl: "" });
    const edit = upsertLibrary(lib("edit"));
    await applySnapshot({ schemaVersion: 4, items: [], books: [], works: [], lists: [], libraries: [{ ...lib("imported"), schemaVersion: 2, updatedAt: 1 }] });
    await edit;
    // The edit ran first, then the import replaced it; never the reverse interleaving.
    expect((await getSnapshot()).libraries.map((l) => l.id)).toEqual(["imported"]);
  });
});
