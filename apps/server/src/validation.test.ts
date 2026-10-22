import { isValidIsbn } from "@book-explorer/shared";
import { describe, expect, it } from "vitest";
import { isOpenLibraryAuthorId, isOpenLibraryWorkId, parseSearchFilters } from "./validation.js";

describe("isValidIsbn", () => {
  it("accepts bare and hyphenated ISBN-13s and ISBN-10s", () => {
    expect(isValidIsbn("9780141439518")).toBe(true);
    expect(isValidIsbn("978-0-14-143951-8")).toBe(true);
    expect(isValidIsbn("0141439513")).toBe(true);
    expect(isValidIsbn("080442957x")).toBe(true);
  });

  it("rejects the wrong length or a misplaced X", () => {
    expect(isValidIsbn("12345")).toBe(false);
    expect(isValidIsbn("97801414395180")).toBe(false);
    expect(isValidIsbn("X801429570")).toBe(false);
    expect(isValidIsbn("not an isbn")).toBe(false);
  });
});

describe("Open Library ids", () => {
  it("distinguishes author ids from work ids", () => {
    expect(isOpenLibraryAuthorId("OL21594A")).toBe(true);
    expect(isOpenLibraryAuthorId("OL66554W")).toBe(false);
    expect(isOpenLibraryWorkId("OL66554W")).toBe(true);
    expect(isOpenLibraryWorkId("OL21594A")).toBe(false);
    expect(isOpenLibraryWorkId("../OL1W")).toBe(false);
  });
});

describe("parseSearchFilters", () => {
  it("accepts valid filters", () => {
    expect(parseSearchFilters({ author: " Tolkien ", language: "eng", yearFrom: "1950", yearTo: "1960", sort: "new" })).toEqual({
      author: "Tolkien", language: "eng", yearFrom: 1950, yearTo: 1960, sort: "new",
    });
  });

  it.each([
    [{ yearFrom: "19x0" }], [{ yearTo: "99" }], [{ yearFrom: "1990", yearTo: "1980" }],
    [{ language: "english" }], [{ sort: "random" }], [{ author: "a".repeat(101) }],
  ])("rejects malformed filters %j", (raw) => {
    expect(typeof parseSearchFilters(raw)).toBe("string");
  });
});
