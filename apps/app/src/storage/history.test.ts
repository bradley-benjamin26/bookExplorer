import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "../test/asyncStorageMock";
import { addRecentIsbn, getRecentIsbns } from "./history";

vi.mock("@react-native-async-storage/async-storage", () => import("../test/asyncStorageMock"));

describe("history", () => {
  beforeEach(() => AsyncStorage.clear());

  it("moves a repeated ISBN to the front instead of duplicating it", async () => {
    await addRecentIsbn("1");
    await addRecentIsbn("2");
    await addRecentIsbn("1");
    expect(await getRecentIsbns()).toEqual(["1", "2"]);
  });

  it("keeps only the 20 most recent", async () => {
    for (let i = 0; i < 25; i++) await addRecentIsbn(String(i));
    const recent = await getRecentIsbns();
    expect(recent).toHaveLength(20);
    expect(recent[0]).toBe("24");
  });
});
