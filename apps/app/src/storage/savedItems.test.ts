import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "../test/asyncStorageMock";
import { getSavedItems, isItemSaved, removeSaved, toggleSaved } from "./savedItems";

vi.mock("@react-native-async-storage/async-storage", () => import("../test/asyncStorageMock"));

describe("savedItems", () => {
  beforeEach(() => AsyncStorage.clear());

  it("toggles an item on and off", async () => {
    const item = { type: "book" as const, id: "9780141439518", title: "Pride and Prejudice" };
    expect(await toggleSaved(item)).toBe(true);
    expect(await isItemSaved("book", item.id)).toBe(true);
    expect(await toggleSaved(item)).toBe(false);
    expect(await isItemSaved("book", item.id)).toBe(false);
  });

  it("keys items by type as well as id", async () => {
    await toggleSaved({ type: "work", id: "OL1W", title: "A work" });
    expect(await isItemSaved("author", "OL1W")).toBe(false);
  });

  it("lists the newest save first and removes by type and id", async () => {
    await toggleSaved({ type: "author", id: "OL1A", title: "First" });
    await toggleSaved({ type: "author", id: "OL2A", title: "Second" });
    expect((await getSavedItems()).map((i) => i.id)).toEqual(["OL2A", "OL1A"]);
    await removeSaved("author", "OL2A");
    expect((await getSavedItems()).map((i) => i.id)).toEqual(["OL1A"]);
  });

  it("treats corrupt stored data as empty", async () => {
    await AsyncStorage.setItem("book-explorer:saved-items", "{not json");
    expect(await getSavedItems()).toEqual([]);
  });

  it("keeps both saves when two toggles overlap", async () => {
    await Promise.all([
      toggleSaved({ type: "book", id: "A", title: "A" }),
      toggleSaved({ type: "book", id: "B", title: "B" }),
    ]);
    expect((await getSavedItems()).map((i) => i.id).sort()).toEqual(["A", "B"]);
  });
});
