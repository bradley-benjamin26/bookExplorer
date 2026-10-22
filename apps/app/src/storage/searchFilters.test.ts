import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "../test/asyncStorageMock";
import { DEFAULT_SEARCH_FILTERS, getSearchFilters, setSearchFilters, toSearchParams } from "./searchFilters";

vi.mock("@react-native-async-storage/async-storage", () => import("../test/asyncStorageMock"));

describe("searchFilters", () => {
  beforeEach(() => AsyncStorage.clear());

  it("defaults, then round-trips the last choice", async () => {
    expect(await getSearchFilters()).toEqual(DEFAULT_SEARCH_FILTERS);
    const choice = { mode: "author" as const, yearFrom: "1950", yearTo: "", language: "eng" };
    await setSearchFilters(choice);
    expect(await getSearchFilters()).toEqual(choice);
  });

  it("falls back to defaults for corrupt stored data", async () => {
    await AsyncStorage.setItem("book-explorer:search-filters", "{nope");
    expect(await getSearchFilters()).toEqual(DEFAULT_SEARCH_FILTERS);
  });

  it("maps the mode onto the right param and drops invalid values", () => {
    expect(toSearchParams("le guin", { mode: "author", yearFrom: "1970", yearTo: "19", language: "ENG" })).toEqual({
      author: "le guin", yearFrom: "1970", language: "eng",
    });
    expect(toSearchParams("dune", DEFAULT_SEARCH_FILTERS)).toEqual({ q: "dune" });
  });
});
