import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "../test/asyncStorageMock";
import { upsertLibrary } from "./librarySettings";
import { getSavedBook, removeSavedBook, updateSavedBook } from "./savedBooks";
import { getSavedItems, isItemSaved, removeSaved, toggleSaved } from "./savedItems";
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
    expect(first.books[0]).toMatchObject({ schemaVersion: 1, updatedAt: 1234, notes: "n" });
    expect(first.items[0].schemaVersion).toBe(1);
    expect(first.libraries[0].schemaVersion).toBe(1);
    await migrateStorage();
    expect(await getSnapshot()).toEqual(first);
  });

  it("round-trips through applySnapshot, replacing existing data", async () => {
    await toggleSaved({ type: "book", id: "1", title: "One" });
    await AsyncStorage.setItem("book-explorer:saved-book:1", JSON.stringify({ ...legacyBook, schemaVersion: 1, updatedAt: 5 }));
    await upsertLibrary({ id: "a", name: "A", isbnUrl: "x", titleUrl: "" });
    const snap = await getSnapshot();
    await AsyncStorage.clear();
    await toggleSaved({ type: "work", id: "stale", title: "Stale" });
    await AsyncStorage.setItem("book-explorer:saved-book:stale", JSON.stringify({ ...legacyBook, isbn: "stale" }));
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
    expect(Object.keys(await getSnapshot()).sort()).toEqual(["books", "items", "libraries", "schemaVersion"]);
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
