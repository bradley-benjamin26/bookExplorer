import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "../test/asyncStorageMock";
import {
  buildLibraryIsbnSearchUrl,
  buildLibraryTitleSearchUrl,
  getConfiguredLibraries,
  getLibraries,
  removeLibrary,
  upsertLibrary,
} from "./librarySettings";

vi.mock("@react-native-async-storage/async-storage", () => import("../test/asyncStorageMock"));

describe("librarySettings", () => {
  beforeEach(() => AsyncStorage.clear());

  it("migrates the legacy single-library settings once", async () => {
    await AsyncStorage.setItem("book-explorer:local-library-isbn-url", "https://lib.example/isbn/");
    const [migrated] = await getLibraries();
    expect(migrated).toMatchObject({ name: "My Library", isbnUrl: "https://lib.example/isbn/", titleUrl: "" });
    expect(await AsyncStorage.getItem("book-explorer:local-library-isbn-url")).toBeNull();
    expect(await getLibraries()).toHaveLength(1);
  });

  it("upserts, filters unconfigured libraries, and removes", async () => {
    await upsertLibrary({ id: "a", name: "A", isbnUrl: "https://a/", titleUrl: "" });
    await upsertLibrary({ id: "b", name: "B", isbnUrl: " ", titleUrl: "" });
    await upsertLibrary({ id: "a", name: "A renamed", isbnUrl: "https://a/", titleUrl: "" });
    expect((await getLibraries()).map((l) => l.name)).toEqual(["A renamed", "B"]);
    expect((await getConfiguredLibraries()).map((l) => l.id)).toEqual(["a"]);
    expect((await removeLibrary("a")).map((l) => l.id)).toEqual(["b"]);
  });

  it("substitutes placeholders or appends to a prefix URL", () => {
    expect(buildLibraryIsbnSearchUrl("https://lib/search?q={isbn}&x=1", "123")).toBe("https://lib/search?q=123&x=1");
    expect(buildLibraryIsbnSearchUrl("https://lib/isbn/", "123")).toBe("https://lib/isbn/123");
    expect(buildLibraryTitleSearchUrl("https://lib/t/", "War & Peace")).toBe("https://lib/t/War%20%26%20Peace");
  });
});
