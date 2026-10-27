import { isValidIsbn } from "@book-explorer/shared";
import { describe, expect, it } from "vitest";
import { isOpenLibraryAuthorId, isOpenLibraryWorkId, isPathEndpointId, parseSearchFilters } from "./validation.js";

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

  it("accepts sort=rating and sort=readinglog", () => {
    expect(parseSearchFilters({ sort: "rating" })).toEqual({ sort: "rating" });
    expect(parseSearchFilters({ sort: "readinglog" })).toEqual({ sort: "readinglog" });
  });

  it("rejects repeated (array) params instead of throwing", () => {
    expect(typeof parseSearchFilters({ author: ["a", "b"] })).toBe("string");
  });

  it.each([
    [{ yearFrom: "19x0" }], [{ yearTo: "99" }], [{ yearFrom: "1990", yearTo: "1980" }],
    [{ language: "english" }], [{ sort: "random" }], [{ author: "a".repeat(101) }],
  ])("rejects malformed filters %j", (raw) => {
    expect(typeof parseSearchFilters(raw)).toBe("string");
  });
});

describe("isWikidataQid", () => {
  it("accepts Q followed by digits and rejects anything else", async () => {
    const { isWikidataQid } = await import("./validation.js");
    expect(isWikidataQid("Q42")).toBe(true);
    for (const bad of ["", "42", "Q0", "Q01", "Qabc", "Q42/../x"]) expect(isWikidataQid(bad)).toBe(false);
  });
});

describe("isPathEndpointId", () => {
  it("accepts author, work and subject node ids", () => {
    expect(isPathEndpointId("author:OL21594A")).toBe(true);
    expect(isPathEndpointId("work:OL66554W")).toBe(true);
    expect(isPathEndpointId("subject:science_fiction")).toBe(true);
  });

  it("accepts legacy and unslugified subject and genre ids that slug to a valid subject", () => {
    expect(isPathEndpointId("subject:science_fiction_--_authorship")).toBe(true);
    expect(isPathEndpointId("subject:Science Fiction")).toBe(true);
    expect(isPathEndpointId("genre:fiction")).toBe(true);
  });

  it("rejects a raw subject id over 200 characters even when it slugifies short", () => {
    expect(isPathEndpointId(`subject:a${",".repeat(300)}`)).toBe(false);
    expect(isPathEndpointId(`genre:a${",".repeat(300)}`)).toBe(false);
  });

  it("rejects other types, mismatched ids and subjects that slug to nothing", () => {
    expect(isPathEndpointId("editions:OL1W")).toBe(false);
    expect(isPathEndpointId("author:OL1W")).toBe(false);
    expect(isPathEndpointId("subject:,")).toBe(false);
    expect(isPathEndpointId("OL1W")).toBe(false);
  });
});
