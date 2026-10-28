import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "../test/asyncStorageMock";
import { DEFAULT_PREFERENCES, getPreferences, setPreferences } from "./preferences";

vi.mock("@react-native-async-storage/async-storage", () => import("../test/asyncStorageMock"));

describe("preferences", () => {
  beforeEach(() => AsyncStorage.clear());

  it("returns the defaults when nothing is stored", async () => {
    expect(await getPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it("falls back per field on bad stored values", async () => {
    await AsyncStorage.setItem("book-explorer:preferences", JSON.stringify({ recordHistory: "no", scanHaptics: false, defaultListIds: { book: 3, author: "a1" } }));
    expect(await getPreferences()).toEqual({ ...DEFAULT_PREFERENCES, scanHaptics: false, defaultListIds: { book: null, author: "a1" } });
  });

  it("returns the defaults on corrupt JSON", async () => {
    await AsyncStorage.setItem("book-explorer:preferences", "{");
    expect(await getPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it("concurrent partial updates both land", async () => {
    await Promise.all([setPreferences({ recordHistory: false }), setPreferences({ startInBatchScan: true })]);
    expect(await getPreferences()).toMatchObject({ recordHistory: false, startInBatchScan: true });
  });
});
