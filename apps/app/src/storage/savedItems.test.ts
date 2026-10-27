import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "../test/asyncStorageMock";
import { ensureSaved, getSavedItems, removeSaved } from "./savedItems";

vi.mock("@react-native-async-storage/async-storage", () => import("../test/asyncStorageMock"));

describe("savedItems", () => {
  beforeEach(() => AsyncStorage.clear());

  it("ensureSaved is idempotent, even when called concurrently", async () => {
    const item = { type: "book" as const, id: "9780141439518", title: "Pride and Prejudice" };
    await Promise.all([ensureSaved(item), ensureSaved(item)]);
    expect(await getSavedItems()).toHaveLength(1);
  });

  it("keys items by type as well as id", async () => {
    await ensureSaved({ type: "work", id: "OL1W", title: "A work" });
    expect((await getSavedItems()).some((i) => i.type === "author" && i.id === "OL1W")).toBe(false);
  });

  it("lists the newest save first and removes by type and id", async () => {
    await ensureSaved({ type: "author", id: "OL1A", title: "First" });
    await ensureSaved({ type: "author", id: "OL2A", title: "Second" });
    expect((await getSavedItems()).map((i) => i.id)).toEqual(["OL2A", "OL1A"]);
    await removeSaved("author", "OL2A");
    expect((await getSavedItems()).map((i) => i.id)).toEqual(["OL1A"]);
  });

  it("treats corrupt stored data as empty", async () => {
    await AsyncStorage.setItem("book-explorer:saved-items", "{not json");
    expect(await getSavedItems()).toEqual([]);
  });

  it("keeps both saves when two saves overlap", async () => {
    await Promise.all([
      ensureSaved({ type: "book", id: "A", title: "A" }),
      ensureSaved({ type: "book", id: "B", title: "B" }),
    ]);
    expect((await getSavedItems()).map((i) => i.id).sort()).toEqual(["A", "B"]);
  });
});
