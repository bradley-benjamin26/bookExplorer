import { describe, expect, it } from "vitest";
import { isOpenLibraryAuthorId, isOpenLibraryWorkId, isValidIsbn } from "./validation.js";

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
